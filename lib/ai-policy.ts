/**
 * Bayi AI politikası — TEK KAYNAK (P0-32).
 *
 * Bayinin `/dealer/ai-settings` ekranındaki ana anahtar (`isEnabled`) ve otomatik analiz
 * (`autoAnalyze`) ayarları önceden yalnız ilk analiz yolunda (`/api/feedbacks`) okunuyordu;
 * `ai-retry` cron'u, Inngest hattı, otomatik yanıt, öğrenme ve sohbet yolları ayarı hiç
 * okumadan müşteri metnini LLM sağlayıcısına gönderiyordu (sözleşme ihlali).
 *
 * Kural:
 *  - Müşteri metnini bayi adına LLM'e gönderen HER yol önce bu modülü sorar.
 *  - `isEnabled=false` → o bayi için HİÇBİR LLM çağrısı yapılmaz (analiz, sohbet, içgörü,
 *    yanıt önerisi, otomatik AI yanıtı, öğrenme, embedding).
 *  - `autoAnalyze=false` → arka plan analizi (pipeline / cron) çalışmaz; bayinin kendi
 *    başlattığı etkileşimli AI özellikleri ana anahtar açıksa çalışabilir.
 *  - Ayar satırı yoksa şema varsayılanı geçerlidir (ikisi de açık).
 *  - Ayar OKUNAMAZSA (DB hatası) fail-closed: AI kapalı kabul edilir.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export interface DealerAiPolicy {
  dealerId: string;
  /** Ana anahtar: kapalıysa bayi adına hiçbir LLM çağrısı yapılmaz. */
  aiEnabled: boolean;
  /** Arka plan (otomatik) geri bildirim analizi. */
  autoAnalyze: boolean;
  alertOnToxic: boolean;
  alertOnUrgent: boolean;
  alertOnChurnRisk: boolean;
  /** Bayinin kendi analiz bağlamı (yalnız kendi kiracısına uygulanır, sınırlı ek bağlam). */
  customPrompt: string | null;
  /** settings: satırdan okundu · default: satır yok · unavailable: okunamadı (fail-closed) */
  source: 'settings' | 'default' | 'unavailable';
}

/** Ayar değişikliğinin en geç bu sürede tüm yollara yansıması için kısa önbellek. */
const POLICY_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 2_000;
const cache = new Map<string, { at: number; policy: DealerAiPolicy }>();

function defaultPolicy(dealerId: string): DealerAiPolicy {
  return {
    dealerId,
    aiEnabled: true,
    autoAnalyze: true,
    alertOnToxic: true,
    alertOnUrgent: true,
    alertOnChurnRisk: true,
    customPrompt: null,
    source: 'default',
  };
}

function unavailablePolicy(dealerId: string): DealerAiPolicy {
  return {
    ...defaultPolicy(dealerId),
    aiEnabled: false,
    autoAnalyze: false,
    source: 'unavailable',
  };
}

/**
 * Bayinin geçerli AI politikasını döndürür. `fresh: true` önbelleği atlar (arka plan
 * hattı her kayıt için güncel ayarı okumalı). Hata durumunda fail-closed politika döner
 * ve ÖNBELLEĞE YAZILMAZ (geçici hata kalıcı kapanmaya dönüşmesin).
 */
export async function getDealerAiPolicy(
  dealerId: string,
  opts: { fresh?: boolean } = {}
): Promise<DealerAiPolicy> {
  if (!opts.fresh) {
    const hit = cache.get(dealerId);
    if (hit && Date.now() - hit.at < POLICY_TTL_MS) return hit.policy;
  }

  let policy: DealerAiPolicy;
  try {
    const row = await prisma.aISettings.findUnique({
      where: { dealerId },
      select: {
        isEnabled: true,
        autoAnalyze: true,
        alertOnToxic: true,
        alertOnUrgent: true,
        alertOnChurnRisk: true,
        customPrompt: true,
      },
    });
    policy = row
      ? {
          dealerId,
          aiEnabled: row.isEnabled !== false,
          autoAnalyze: row.autoAnalyze !== false,
          alertOnToxic: row.alertOnToxic !== false,
          alertOnUrgent: row.alertOnUrgent !== false,
          alertOnChurnRisk: row.alertOnChurnRisk !== false,
          customPrompt: row.customPrompt ?? null,
          source: 'settings',
        }
      : defaultPolicy(dealerId);
  } catch (err) {
    console.error('[AI_POLICY] ayar okunamadı, fail-closed:', err instanceof Error ? err.message : err);
    return unavailablePolicy(dealerId);
  }

  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(dealerId, { at: Date.now(), policy });
  return policy;
}

/** Arka plan analizi yapılabilir mi? (ana anahtar + otomatik analiz) */
export function canAutoAnalyze(policy: DealerAiPolicy): boolean {
  return policy.aiEnabled && policy.autoAnalyze;
}

/** Bayi adına herhangi bir LLM çağrısı yapılabilir mi? (ana anahtar) */
export function canUseAi(policy: DealerAiPolicy): boolean {
  return policy.aiEnabled;
}

/** Kısa yol: bayi için AI ana anahtarı açık mı? (fail-closed) */
export async function isDealerAiEnabled(dealerId: string): Promise<boolean> {
  return canUseAi(await getDealerAiPolicy(dealerId));
}

/** Ayar kaydedildikten sonra çağrılır; bir sonraki okuma DB'den gelir. */
export function invalidateDealerAiPolicy(dealerId?: string): void {
  if (dealerId) cache.delete(dealerId);
  else cache.clear();
}

/**
 * Prisma `User` (bayi) filtresi: arka plan analizine İZİN VEREN bayiler.
 * Ayar satırı yoksa varsayılan açıktır. `ai-retry` cron'u bunu `qrCode.dealer` altında
 * kullanır; böylece AI'ı kapalı bayinin kaydı sorguya HİÇ girmez.
 */
export function dealerAutoAnalyzeAllowedWhere(): Prisma.UserWhereInput {
  return {
    OR: [
      { aiSettings: { is: null } },
      { aiSettings: { is: { isEnabled: true, autoAnalyze: true } } },
    ],
  };
}

/** Bayi AI'ı kapattığında etkileşimli uçların fırlatabileceği tipli hata. */
export class AiDisabledError extends Error {
  readonly statusCode = 403;
  readonly code = 'AI_DISABLED';
  constructor(message = 'AI özellikleri bu işletme için kapalı. Ayarlar > AI ekranından açabilirsiniz.') {
    super(message);
    this.name = 'AiDisabledError';
  }
}

/** Test yardımcısı: önbelleği temizler. */
export function __resetAiPolicyCacheForTests(): void {
  cache.clear();
}
