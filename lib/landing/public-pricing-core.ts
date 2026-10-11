/**
 * Herkese açık fiyatlandırma — SAF çekirdek.
 *
 * Denetim (landing.md Bulgu 5, envanter #4/#35/#36/#37): fiyatlar eskiden üç ayrı sabitte
 * (landing-content, JSON-LD, lab) duruyordu ve faturalama tablosundan kopuktu. Artık tek
 * kaynak `PricingPlan` (admin /admin/pricing'den yönetir; bayi faturalaması da aynı tabloyu
 * okur). Kartlar ve yapılandırılmış veri (JSON-LD) aynı listeden üretilir.
 *
 * Vaatler: kart yalnız iki tür satır gösterir — (1) gerçekten UYGULANAN kotalar
 * (`maxQRCodes`, `maxBranches`; lib/plan-limits uygular), (2) admin'in plana yazdığı
 * özellik metinleri. Kodda olmayan "aylık 100 geri bildirim" türü sabit vaatler kaldırıldı.
 */
import type { PrismaClient } from '@prisma/client';
import type { PublicLocale } from './public-stats-core';

export interface PublicPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: string;
  features: string[];
  maxQRCodes: number | null;
  maxBranches: number | null;
  isPopular: boolean;
}

export type PricingDb = Pick<PrismaClient, 'pricingPlan'>;

type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: string;
  features: unknown;
  maxQRCodes: number | null;
  maxBranches: number | null;
  isPopular: boolean;
};

const MAX_FEATURES = 8;

/** JSON `features` alanını güvenli bir metin listesine çevirir. */
export function normalizePlanFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const text = item.replace(/<[^>]*>/g, '').trim();
    if (text && text.length <= 160) out.push(text);
    if (out.length >= MAX_FEATURES) break;
  }
  return out;
}

export function toPublicPlan(row: PlanRow): PublicPlan {
  const price = Number.isFinite(row.price) && row.price > 0 ? row.price : 0;
  return {
    id: row.id,
    name: row.name.trim(),
    description: row.description?.trim() || null,
    price,
    currency: (row.currency || 'TRY').toUpperCase(),
    interval: row.interval || 'monthly',
    features: normalizePlanFeatures(row.features),
    maxQRCodes: row.maxQRCodes ?? null,
    maxBranches: row.maxBranches ?? null,
    isPopular: !!row.isPopular,
  };
}

/** Satışta olan planlar (aktif + arşivlenmemiş), admin sırasıyla. Hata fırlatır. */
export async function loadPublicPlans(db: PricingDb): Promise<PublicPlan[]> {
  const rows = await db.pricingPlan.findMany({
    where: { isActive: true, archivedAt: null },
    orderBy: [{ order: 'asc' }, { price: 'asc' }],
    take: 6,
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      currency: true,
      interval: true,
      features: true,
      maxQRCodes: true,
      maxBranches: true,
      isPopular: true,
    },
  });
  return rows.map(toPublicPlan);
}

function numberLocale(locale: PublicLocale): string {
  return locale === 'en' ? 'en-US' : 'tr-TR';
}

/** ₺299 / ₺299,90 / $12 — tam sayıysa kuruş gösterilmez. */
export function formatPlanPrice(price: number, currency: string, locale: PublicLocale = 'tr'): string {
  const whole = Number.isInteger(price);
  try {
    return new Intl.NumberFormat(numberLocale(locale), {
      style: 'currency',
      currency: currency || 'TRY',
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

export function intervalSuffix(interval: string, locale: PublicLocale = 'tr'): string {
  const tr: Record<string, string> = { monthly: '/ay', yearly: '/yıl', lifetime: 'tek seferlik' };
  const en: Record<string, string> = { monthly: '/mo', yearly: '/yr', lifetime: 'one-time' };
  return (locale === 'en' ? en : tr)[interval] ?? '';
}

/** Gerçekten uygulanan kota satırları (lib/plan-limits). null = sınırsız. */
export function planQuotaLines(plan: Pick<PublicPlan, 'maxQRCodes' | 'maxBranches'>, locale: PublicLocale = 'tr'): string[] {
  const fmt = new Intl.NumberFormat(numberLocale(locale));
  if (locale === 'en') {
    return [
      plan.maxQRCodes == null ? 'Unlimited QR codes' : `${fmt.format(plan.maxQRCodes)} QR codes`,
      plan.maxBranches == null ? 'Unlimited branches' : `${fmt.format(plan.maxBranches)} ${plan.maxBranches === 1 ? 'branch' : 'branches'}`,
    ];
  }
  return [
    plan.maxQRCodes == null ? 'Sınırsız QR kod' : `${fmt.format(plan.maxQRCodes)} QR kod`,
    plan.maxBranches == null ? 'Sınırsız şube' : `${fmt.format(plan.maxBranches)} şube`,
  ];
}

/** En düşük ücretli aylık/yıllık plan (ör. "₺299'dan başlayan"). Yoksa null. */
export function lowestPaidPlan(plans: PublicPlan[]): PublicPlan | null {
  let best: PublicPlan | null = null;
  for (const p of plans) {
    if (p.price <= 0 || p.interval === 'lifetime') continue;
    if (!best || p.price < best.price) best = p;
  }
  return best;
}

export function hasFreePlan(plans: PublicPlan[]): boolean {
  return plans.some((p) => p.price <= 0);
}

/**
 * Plan kartı CTA'sı: işletme rolü ve plan niyeti kayda taşınır; kayıttan sonra faturalama
 * sayfası seçilen planla açılır (callbackUrl, kayıt sayfası tarafından doğrulanır).
 */
export function registerHrefForPlan(planId: string, src = 'pricing'): string {
  const params = new URLSearchParams({
    role: 'DEALER',
    plan: planId,
    src,
    callbackUrl: `/dealer/settings?plan=${planId}`,
  });
  return `/auth/register?${params.toString()}`;
}

/** Fiyat kartlarıyla AYNI veriden schema.org teklif listesi (uydurma geçerlilik tarihi yok). */
export function buildPricingJsonLd(plans: PublicPlan[], opts: { base: string; pagePath: string }) {
  if (plans.length === 0) return null;
  const url = `${opts.base}${opts.pagePath}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: plans.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        ...(p.description ? { description: p.description } : {}),
        offers: {
          '@type': 'Offer',
          price: p.price.toFixed(2),
          priceCurrency: p.currency,
          url,
          availability: 'https://schema.org/InStock',
        },
      },
    })),
  };
}
