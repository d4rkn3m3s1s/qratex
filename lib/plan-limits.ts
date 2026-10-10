/**
 * Plan kotası uygulama katmanı.
 *
 * PricingPlan modelinde maxQRCodes/maxBranches limitleri tanımlıydı ama hiçbir
 * yerde uygulanmıyordu → ücretsiz/plansız bayiler sınırsız QR oluşturabiliyordu
 * (gelir kaçağı). Bu modül bayinin etkin planını çözer ve kota kontrolü yapar.
 *
 * Plan atanmamış (pricingPlanId = null) bayi DEFAULT_FREE_LIMITS'e tabidir;
 * null limit = sınırsız (üst plan). ADMIN her zaman limitsizdir.
 */
import { prisma } from '@/lib/prisma';

export interface PlanLimits {
  maxQRCodes: number | null; // null = sınırsız
  maxBranches: number | null;
  planName: string;
}

/**
 * Plan atanmamış bayiler için ücretsiz kademe varsayılanı. Çevre değişkeniyle
 * ayarlanabilir; geriye-uyumluluk için cömert ama sonsuz değil.
 */
function defaultFreeLimits(): PlanLimits {
  const raw = Number(process.env.FREE_TIER_MAX_QRCODES);
  const maxQRCodes = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3;
  return { maxQRCodes, maxBranches: 1, planName: 'Ücretsiz' };
}

/** Bayinin etkin plan limitlerini döndürür. */
export async function getDealerPlanLimits(dealerId: string): Promise<PlanLimits> {
  const user = await prisma.user.findUnique({
    where: { id: dealerId },
    select: {
      role: true,
      pricingPlan: {
        select: { name: true, maxQRCodes: true, maxBranches: true },
      },
    },
  });

  // ADMIN sınırsız.
  if (user?.role === 'ADMIN') {
    return { maxQRCodes: null, maxBranches: null, planName: 'Admin' };
  }

  // Plan ataması kaynak-doğrudur: planın pasifleştirilmesi ya da arşivlenmesi
  // (isActive=false / archivedAt) yalnız YENİ SATIŞI kapatır, mevcut aboneyi ücretsiz
  // kademeye DÜŞÜRMEZ (P0-26). Önceden `!plan.isActive` → ücretsiz kademe idi: "Aktif"
  // anahtarını kapatmak bütün aboneleri sessizce 3 QR'a indiriyordu.
  const plan = user?.pricingPlan;
  if (!plan) {
    return defaultFreeLimits();
  }
  return {
    maxQRCodes: plan.maxQRCodes ?? null,
    maxBranches: plan.maxBranches ?? null,
    planName: plan.name,
  };
}

export interface QuotaCheck {
  allowed: boolean;
  used: number;
  limit: number | null;
  planName: string;
  /** Limit aşıldıysa kullanıcıya gösterilecek upsell mesajı. */
  reason?: string;
}

/**
 * Bayinin yeni bir QR kodu oluşturabilir mi kontrol eder (kota dolmadıysa).
 * Sınırsız (limit null) ise her zaman izinli.
 */
export async function canCreateQRCode(dealerId: string): Promise<QuotaCheck> {
  const limits = await getDealerPlanLimits(dealerId);
  if (limits.maxQRCodes == null) {
    return { allowed: true, used: 0, limit: null, planName: limits.planName };
  }
  // Kota CANLI kodları sayar (iptal edilmemiş + arşivlenmemiş) — lib/qr-quota.ts ile aynı
  // tanım (`liveQrWhere`; döngüsel import olmasın diye burada açık yazıldı).
  // P0-24 "arşivle → yeni oluştur → arşivden geri al" döngüsü limiti AŞAMAZ: arşivden geri
  // alma ve `revoke:false` aynı canlı kotadan bayi kilidi altında geçer (QrQuotaExceededError).
  // Tüm satırları saymak ise rotate edilen (iptal) ve arşivlenen kodları kalıcı kota
  // tüketicisine çevirirdi: rotate kota-nötr olmaktan çıkar, "sil" yer açmazdı.
  const used = await prisma.qRCode.count({ where: { dealerId, revokedAt: null, archivedAt: null } });
  const allowed = used < limits.maxQRCodes;
  return {
    allowed,
    used,
    limit: limits.maxQRCodes,
    planName: limits.planName,
    reason: allowed
      ? undefined
      : `"${limits.planName}" planınızın QR kodu limitine ulaştınız (${used}/${limits.maxQRCodes}). Daha fazlası için planınızı yükseltin.`,
  };
}
