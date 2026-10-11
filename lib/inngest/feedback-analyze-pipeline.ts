/**
 * Geri bildirim AI analiz hattı — Inngest (`/api/internal/inngest/feedback-analyze`) ve
 * `ai-retry` cron'u bu TEK fonksiyonu çağırır (Inngest lambda boyutu için burada tutulur).
 *
 * P0-32 değişmezleri:
 *  1. KAPI (`shouldAnalyzeFeedback`): metin yok/kısa, silinmiş, zaten işlenmiş ya da deneme
 *     hakkı bitmiş kayıt hattan geçmez. Bayinin AI ana anahtarı veya otomatik analiz ayarı
 *     kapalıysa (ya da ayar okunamazsa — fail-closed) müşteri metni LLM'e GİTMEZ ve hiçbir
 *     yan etki çalışmaz.
 *  2. DENEME SAYACI: her koşu `aiAttempts`'i ATOMİK koşullu artışla "talep eder"
 *     (`aiProcessedAt IS NULL AND aiAttempts < MAX AND kira süresi dolmuş`). Talebi
 *     kazanamayan koşu (eşzamanlı Inngest + cron, üst üste retry) hiçbir şey yapmaz.
 *     Kalıcı başarısız kayıt (injection filtresi, bütçe, sağlayıcı yok) en fazla
 *     `MAX_AI_ATTEMPTS` kez denenir; sonsuz retry döngüsü yok.
 *  3. TEK SEFERLİK YAN ETKİLER: gerçek analiz sonucu `aiProcessedAt IS NULL` koşullu yazılır;
 *     yazımı kazanan koşu "tamamlayan" koşudur. Uyarı bildirimleri (toksik/acil/churn)
 *     geri bildirim × tür başına advisory lock + dedupeKey ile TEK kez oluşturulur ve bayinin
 *     `alertOn*` tercihlerine uyar. Otomatik yanıt (`processAutoReplies`) zaten
 *     `dealerReply IS NULL` koşullu atomik yazar; bayinin elle yazdığı yanıt asla ezilmez.
 */
import { prisma } from '@/lib/prisma';
import { analyzeWithFallback, isAIConfigured } from '@/lib/ai-engine';
import {
  formatAdaptiveProfile,
  getAdaptiveProfileForDealer,
  maybeTriggerAdaptiveUpdate,
  storeFeedbackEmbedding,
} from '@/lib/ai-learning';
import { processAutoReplies } from '@/lib/auto-reply-engine';
import { maybeCreateAutoRemedyForFeedback } from '@/lib/remedy-automation-core';
import { canAutoAnalyze, getDealerAiPolicy, type DealerAiPolicy } from '@/lib/ai-policy';
import { isAiGuardError } from '@/lib/ai-cost-guard';
import { isAiCircuitOpen } from '@/lib/ai-provider-resilience';

/** Bu uzunluğun altındaki metinler analiz edilmez (ilk analiz yolu `/api/feedbacks` ile aynı eşik). */
export const MIN_ANALYZABLE_TEXT_LENGTH = 5;
/** Bir geri bildirim için en fazla LLM analiz denemesi (ilk koşu dahil). */
export const MAX_AI_ATTEMPTS = 3;
/** Eşzamanlı koşuları ayıran kira süresi: bu süre dolmadan aynı kayıt yeniden talep edilemez. */
export const AI_ATTEMPT_LEASE_MS = 2 * 60 * 1000;

export type FeedbackAnalyzeSource = 'event' | 'retry';

export type FeedbackAnalyzePipelineResult =
  | { skipped: true; reason: string }
  | { success: true; sentiment: string; completed: boolean; fallback: boolean; attempt: number };

type GateInput = {
  text: string | null;
  deletedAt: Date | null;
  aiProcessedAt: Date | null;
  aiAttempts: number | null;
} | null;

/**
 * Hat kapısı — saf fonksiyon. `policy` verilirse bayi AI tercihi de denetlenir.
 * `{ ok: true }` dışındaki her sonuç LLM çağrısı YAPILMAMASI demektir.
 */
export function shouldAnalyzeFeedback(
  f: GateInput,
  policy?: Pick<DealerAiPolicy, 'aiEnabled' | 'autoAnalyze' | 'source'> | null
): { ok: true } | { ok: false; reason: string } {
  if (!f) return { ok: false, reason: 'not-found' };
  if (f.deletedAt) return { ok: false, reason: 'deleted' };
  if (!f.text || f.text.trim().length < MIN_ANALYZABLE_TEXT_LENGTH) return { ok: false, reason: 'no-text' };
  if (f.aiProcessedAt) return { ok: false, reason: 'already-processed' };
  if ((f.aiAttempts ?? 0) >= MAX_AI_ATTEMPTS) return { ok: false, reason: 'attempts-exhausted' };
  if (policy !== undefined) {
    if (!policy) return { ok: false, reason: 'ai-disabled' };
    if (policy.source === 'unavailable') return { ok: false, reason: 'policy-unavailable' };
    if (!canAutoAnalyze(policy as DealerAiPolicy)) return { ok: false, reason: 'ai-disabled' };
  }
  return { ok: true };
}

/**
 * Deneme hakkını ATOMİK talep eder. Kazanırsa yeni deneme numarasını, kaybederse null döner.
 */
async function claimAttempt(feedbackId: string, now: Date): Promise<number | null> {
  const leaseCutoff = new Date(now.getTime() - AI_ATTEMPT_LEASE_MS);
  const claimed = await prisma.feedback.updateMany({
    where: {
      id: feedbackId,
      deletedAt: null,
      aiProcessedAt: null,
      aiAttempts: { lt: MAX_AI_ATTEMPTS },
      OR: [{ aiLastAttemptAt: null }, { aiLastAttemptAt: { lt: leaseCutoff } }],
    },
    data: { aiAttempts: { increment: 1 }, aiLastAttemptAt: now },
  });
  if (claimed.count !== 1) return null;
  const row = await prisma.feedback.findUnique({ where: { id: feedbackId }, select: { aiAttempts: true } });
  return row?.aiAttempts ?? 1;
}

type AlertKind = 'toxic' | 'urgent' | 'churn';

const ALERT_COPY: Record<AlertKind, { title: string; message: string }> = {
  toxic: {
    title: '⚠️ Toksik İçerik Tespit Edildi',
    message: 'Bir geri bildirimde uygunsuz içerik tespit edildi. Lütfen inceleyin.',
  },
  urgent: {
    title: '🔴 Acil Geri Bildirim',
    message: 'Yüksek aciliyetli bir geri bildirim alındı. Hemen aksiyon gerekebilir.',
  },
  churn: {
    title: '⚡ Müşteri Kaybı Riski',
    message: 'Bir müşterinin kaybedilme riski yüksek. Geri bildirimi inceleyin.',
  },
};

/**
 * Geri bildirim × uyarı türü başına TEK bildirim (advisory lock + dedupeKey kontrolü aynı
 * transaction içinde; `createIncidentOnce` deseni). Oluşturduysa true.
 */
export async function notifyDealerOnce(params: {
  dealerId: string;
  feedbackId: string;
  kind: AlertKind;
}): Promise<boolean> {
  const dedupeKey = `ai-alert:${params.kind}:${params.feedbackId}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dedupeKey}))`;
    const existing = await tx.notification.findFirst({
      where: { userId: params.dealerId, data: { path: ['dedupeKey'], equals: dedupeKey } },
      select: { id: true },
    });
    if (existing) return false;
    const copy = ALERT_COPY[params.kind];
    await tx.notification.create({
      data: {
        userId: params.dealerId,
        title: copy.title,
        message: copy.message,
        type: 'warning',
        data: { dedupeKey, feedbackId: params.feedbackId, kind: params.kind, source: 'ai-pipeline' },
      },
    });
    return true;
  });
}

export async function runFeedbackAnalyzePipeline(
  feedbackId: string,
  opts: { source?: FeedbackAnalyzeSource } = {}
): Promise<FeedbackAnalyzePipelineResult> {
  const source: FeedbackAnalyzeSource = opts.source ?? 'event';

  const f = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    select: {
      id: true,
      text: true,
      rating: true,
      userId: true,
      qrCodeId: true,
      deletedAt: true,
      aiProcessedAt: true,
      aiAttempts: true,
      qrCode: { select: { dealerId: true } },
    },
  });

  const basic = shouldAnalyzeFeedback(f);
  if (!basic.ok) return { skipped: true, reason: basic.reason };
  if (!f || !f.qrCode || !f.text) return { skipped: true, reason: 'not-found' };

  const dealerId = f.qrCode.dealerId;
  const text = f.text;

  // KAPI: bayi tercihi her kayıt için TAZE okunur (ayar değişikliği hemen yürürlüğe girsin).
  const policy = await getDealerAiPolicy(dealerId, { fresh: true });
  const gate = shouldAnalyzeFeedback(f, policy);
  if (!gate.ok) return { skipped: true, reason: gate.reason };

  // Cron yolunda sağlayıcı yapılandırılmamışsa deneme hakkı boşa yakılmaz.
  if (source === 'retry' && !isAIConfigured()) return { skipped: true, reason: 'provider-unavailable' };
  // Sağlayıcı devresi açıksa (üst üste 429/5xx) cron denemesi hak yakmaz; olay yolu yerel analizle sürer.
  if (source === 'retry' && (await isAiCircuitOpen())) return { skipped: true, reason: 'provider-unavailable' };

  const attempt = await claimAttempt(feedbackId, new Date());
  if (attempt === null) return { skipped: true, reason: 'claim-lost' };

  let adaptiveProfileText: string | undefined;
  try {
    const adaptiveProfile = await getAdaptiveProfileForDealer(dealerId);
    adaptiveProfileText = adaptiveProfile?.profile ? formatAdaptiveProfile(adaptiveProfile.profile) : undefined;
  } catch {
    adaptiveProfileText = undefined;
  }

  let analysis: Awaited<ReturnType<typeof analyzeWithFallback>>;
  try {
    analysis = await analyzeWithFallback(text, {
      customPrompt: policy.customPrompt || undefined,
      adaptiveProfile: adaptiveProfileText,
      dealerId,
    });
  } catch (err) {
    // Kiracı bütçesi / dakikalık limit: deneme sayıldı, sonraki koşu (hak kaldıysa) dener.
    if (isAiGuardError(err)) return { skipped: true, reason: err.code === 'AI_DISABLED' ? 'ai-disabled' : 'budget' };
    throw err;
  }

  const isFallback = analysis.modelUsed === 'local-fallback';
  let completed = false;

  if (isFallback) {
    // Gerçek LLM sonucu yok: yalnız kaba toksisite + etiket; aiProcessedAt NULL kalır.
    await prisma.feedback.updateMany({
      where: { id: feedbackId, aiProcessedAt: null },
      data: { isToxic: analysis.toxicity.isToxic, aiModelUsed: 'local-fallback' },
    });
  } else {
    // ATOMİK TAMAMLAMA: aiProcessedAt yalnız bir kez yazılır; yan etkiler yalnız kazanan koşuda.
    const written = await prisma.feedback.updateMany({
      where: { id: feedbackId, aiProcessedAt: null, deletedAt: null },
      data: {
        sentiment: analysis.sentiment.label,
        emotions: analysis.emotions.map((e) => e.label),
        topics: analysis.topics,
        isToxic: analysis.toxicity.isToxic,
        aiAnalysis: JSON.parse(JSON.stringify(analysis)),
        intent: analysis.intent?.label || null,
        intentScore: analysis.intent?.score ?? null,
        urgency: analysis.urgency ?? null,
        effortScore: analysis.effortScore ?? null,
        churnRisk: analysis.churnRisk ?? null,
        entities: analysis.entities ? JSON.parse(JSON.stringify(analysis.entities)) : null,
        themes: analysis.themes ? JSON.parse(JSON.stringify(analysis.themes)) : null,
        statementSentiments: analysis.statementSentiments
          ? JSON.parse(JSON.stringify(analysis.statementSentiments))
          : null,
        actionSuggestions: analysis.actionSuggestions ? JSON.parse(JSON.stringify(analysis.actionSuggestions)) : null,
        aiProcessedAt: new Date(),
        aiModelUsed: analysis.modelUsed || null,
        aiVersion: analysis.version || null,
      },
    });
    completed = written.count === 1;
    if (!completed) return { skipped: true, reason: 'already-processed' };
  }

  // Yan etkiler: gerçek analizi tamamlayan koşu, ya da olay yolunun İLK (yerel) denemesi.
  // Cron'un yerel sonuçlu tekrarları yan etki üretmez.
  const runSideEffects = completed || (source === 'event' && attempt === 1);
  if (!runSideEffects) {
    return { success: true, sentiment: analysis.sentiment.label, completed, fallback: isFallback, attempt };
  }

  const alerts: AlertKind[] = [];
  if (analysis.toxicity.isToxic && policy.alertOnToxic) alerts.push('toxic');
  if (analysis.urgency && analysis.urgency > 0.7 && policy.alertOnUrgent) alerts.push('urgent');
  if (analysis.churnRisk && analysis.churnRisk > 0.7 && policy.alertOnChurnRisk) alerts.push('churn');
  for (const kind of alerts) {
    try {
      await notifyDealerOnce({ dealerId, feedbackId, kind });
    } catch (err) {
      console.error(`[AI_PIPELINE] ${kind} bildirimi yazılamadı:`, err);
    }
  }

  // Otomatik telafi taslağı (kendi içinde mevcut teklif kontrolü var).
  try {
    await maybeCreateAutoRemedyForFeedback({
      feedbackId,
      dealerId,
      userId: f.userId,
      rating: f.rating,
      churnRisk: analysis.churnRisk ?? null,
      qrCodeId: f.qrCodeId,
    });
  } catch (err) {
    console.error('[REMEDY_AUTOMATION] auto-draft failed:', err);
  }

  // Kriz radarı (Gelen Kutusu → Vakalar): olay güdümlü eşik değerlendirmesi. Tekil (kilitli,
  // açık vaka varken yenisini açmaz); hata analizi bozmaz. Günlük bakım işi güvenlik ağıdır.
  try {
    const { runIncidentRadarForDealer } = await import('@/lib/dealer-queues/radar');
    await runIncidentRadarForDealer(dealerId, { trigger: 'event' });
  } catch (err) {
    console.error('[INCIDENT_RADAR] olay güdümlü tarama başarısız:', err);
  }

  await storeFeedbackEmbedding({ feedbackId, dealerId, text });
  if (completed) await maybeTriggerAdaptiveUpdate(dealerId);
  await processAutoReplies(feedbackId);

  return { success: true, sentiment: analysis.sentiment.label, completed, fallback: isFallback, attempt };
}
