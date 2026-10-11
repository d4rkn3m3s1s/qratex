/**
 * Admin → Fiyatlandırma (/admin/pricing) — paylaşılan sözleşme.
 *
 * İstemci (RHF formu) ve sunucu (defineRoute) AYNI zod şemalarını kullanır; saf yardımcılar
 * (aylık eşdeğer, özellik matrisi, Stripe karşılaştırması) burada durur ve test edilir.
 * Bu dosya istemci-güvenlidir: prisma/stripe import ETMEZ.
 */
import { z } from 'zod';

// ───────────────────────────── Sabitler ─────────────────────────────

export const PLAN_INTERVALS = ['monthly', 'yearly', 'lifetime'] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];

export const INTERVAL_LABEL: Record<PlanInterval, string> = {
  monthly: 'Aylık',
  yearly: 'Yıllık',
  lifetime: 'Tek seferlik',
};

/** Kart üzerindeki fiyat son eki. */
export const INTERVAL_SUFFIX: Record<PlanInterval, string> = {
  monthly: '/ ay',
  yearly: '/ yıl',
  lifetime: 'tek seferlik',
};

/** Desteklenen para birimleri (Stripe'ın 2 ondalıklı para birimleri). */
export const PLAN_CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
export type PlanCurrency = (typeof PLAN_CURRENCIES)[number];

export const STRIPE_PRICE_ID_RE = /^price_[A-Za-z0-9]{6,}$/;

export function isPlanInterval(v: unknown): v is PlanInterval {
  return typeof v === 'string' && (PLAN_INTERVALS as readonly string[]).includes(v);
}

// ───────────────────────────── Şemalar ─────────────────────────────

const name = z.string().trim().min(2, 'Plan adı en az 2 karakter olmalı').max(120, 'Plan adı en fazla 120 karakter olabilir');
const description = z.string().trim().max(500, 'Açıklama en fazla 500 karakter olabilir').nullable();
const price = z
  .number({ invalid_type_error: 'Fiyat bir sayı olmalı' })
  .min(0, 'Fiyat 0 veya daha büyük olmalı')
  .max(1_000_000, 'Fiyat en fazla 1.000.000 olabilir')
  .refine((v) => Math.round(v * 100) === Number((v * 100).toFixed(6)), 'Fiyat en fazla 2 ondalık basamak içerebilir');
const limit = z
  .number({ invalid_type_error: 'Limit bir tam sayı olmalı' })
  .int('Limit tam sayı olmalı')
  .min(0, 'Limit 0 veya daha büyük olmalı')
  .max(1_000_000, 'Limit çok büyük')
  .nullable();
const featureList = z
  .array(z.string().trim().min(1).max(200, 'Her özellik en fazla 200 karakter olabilir'))
  .min(1, 'En az 1 özellik girin')
  .max(80, 'En fazla 80 özellik girilebilir')
  .refine((arr) => new Set(arr.map(featureKey)).size === arr.length, 'Aynı özellik iki kez girilmiş');
const stripePriceId = z
  .string()
  .trim()
  .regex(STRIPE_PRICE_ID_RE, 'Stripe fiyat kimliği "price_" ile başlamalı (ör. price_1Pabc…)')
  .nullable();

/** Sunucu girişi (oluşturma). `null` limit = sınırsız (bilinçli seçim). */
export const PlanInput = z.object({
  name,
  description,
  price,
  currency: z.enum(PLAN_CURRENCIES),
  interval: z.enum(PLAN_INTERVALS),
  features: featureList,
  maxQRCodes: limit,
  maxBranches: limit,
  stripePriceId,
  isPopular: z.boolean(),
  isActive: z.boolean(),
});
export type PlanInput = z.infer<typeof PlanInput>;

/** Güncelleme: kısmi alanlar + iyimser kilit (`expectedUpdatedAt`, ISO). */
export const UpdatePlanBody = PlanInput.partial().extend({
  expectedUpdatedAt: z.string().datetime({ message: 'Sürüm bilgisi eksik' }),
});
export type UpdatePlanBody = z.infer<typeof UpdatePlanBody>;

export const ArchivePlanBody = z.object({
  confirm: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});
export type ArchivePlanBody = z.infer<typeof ArchivePlanBody>;

export const ReorderBody = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(200),
});

export const StripeVerifyBody = z.union([
  z.object({ planIds: z.array(z.string().min(1).max(64)).min(1).max(50) }),
  z.object({
    stripePriceId: z.string().trim().regex(STRIPE_PRICE_ID_RE, 'Geçersiz Stripe fiyat kimliği'),
    price,
    currency: z.enum(PLAN_CURRENCIES),
    interval: z.enum(PLAN_INTERVALS),
  }),
]);
export type StripeVerifyBody = z.infer<typeof StripeVerifyBody>;

export const StripeCreatePriceBody = z.object({
  planId: z.string().min(1).max(64),
  expectedUpdatedAt: z.string().datetime(),
});

/**
 * Form şeması (RHF). Özellikler metin kutusunda satır satır; "sınırsız" açık bir anahtar
 * (eskiden "0" yazmak sessizce sınırsız yapıyordu — Bulgu 5).
 */
export const PlanFormSchema = z
  .object({
    name,
    description,
    price,
    currency: z.enum(PLAN_CURRENCIES),
    interval: z.enum(PLAN_INTERVALS),
    featuresText: z.string().max(20_000),
    qrUnlimited: z.boolean(),
    maxQRCodes: limit,
    branchUnlimited: z.boolean(),
    maxBranches: limit,
    stripePriceId: z
      .string()
      .trim()
      .max(255)
      .nullable()
      .refine((v) => v == null || v === '' || STRIPE_PRICE_ID_RE.test(v), 'Stripe fiyat kimliği "price_" ile başlamalı'),
    isPopular: z.boolean(),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const r = featureList.safeParse(splitFeatures(v.featuresText));
    if (!r.success) ctx.addIssue({ code: 'custom', path: ['featuresText'], message: r.error.issues[0]?.message ?? 'Özellikler geçersiz' });
    if (!v.qrUnlimited && v.maxQRCodes == null) ctx.addIssue({ code: 'custom', path: ['maxQRCodes'], message: 'QR limiti girin ya da “Sınırsız”ı açın' });
    if (!v.branchUnlimited && v.maxBranches == null) ctx.addIssue({ code: 'custom', path: ['maxBranches'], message: 'Şube limiti girin ya da “Sınırsız”ı açın' });
  });
export type PlanFormValues = z.infer<typeof PlanFormSchema>;

export const EMPTY_PLAN_FORM: PlanFormValues = {
  name: '',
  description: null,
  price: 0,
  currency: 'TRY',
  interval: 'monthly',
  featuresText: '',
  qrUnlimited: false,
  maxQRCodes: 10,
  branchUnlimited: false,
  maxBranches: 1,
  stripePriceId: null,
  isPopular: false,
  isActive: false,
};

// ───────────────────────────── Saf yardımcılar ─────────────────────────────

export function splitFeatures(text: string): string[] {
  return text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Özellik karşılaştırma anahtarı (matris satırı): boşluk sadeleşir, Türkçe küçük harf. */
export function featureKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

export function formToInput(v: PlanFormValues): PlanInput {
  return {
    name: v.name.trim(),
    description: v.description?.trim() || null,
    price: v.price,
    currency: v.currency,
    interval: v.interval,
    features: splitFeatures(v.featuresText),
    maxQRCodes: v.qrUnlimited ? null : v.maxQRCodes,
    maxBranches: v.branchUnlimited ? null : v.maxBranches,
    stripePriceId: v.stripePriceId?.trim() || null,
    isPopular: v.isPopular,
    isActive: v.isActive,
  };
}

export function planToForm(p: PlanSummary): PlanFormValues {
  return {
    name: p.name,
    description: p.description,
    price: p.price,
    currency: (PLAN_CURRENCIES as readonly string[]).includes(p.currency) ? (p.currency as PlanCurrency) : 'TRY',
    interval: p.interval,
    featuresText: p.features.join('\n'),
    qrUnlimited: p.maxQRCodes == null,
    maxQRCodes: p.maxQRCodes,
    branchUnlimited: p.maxBranches == null,
    maxBranches: p.maxBranches,
    stripePriceId: p.stripePriceId,
    isPopular: p.isPopular,
    isActive: p.isActive,
  };
}

/** Aylık eşdeğer tutar (MRR katkısı). Tek seferlik plan yinelenen gelir üretmez → 0. */
export function monthlyEquivalent(price: number, interval: PlanInterval): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (interval === 'monthly') return price;
  if (interval === 'yearly') return Math.round((price / 12) * 100) / 100;
  return 0;
}

export function formatMoney(amount: number, currency: string, locale = 'tr-TR'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString(locale)} ${currency}`;
  }
}

export interface MatrixRow {
  key: string;
  label: string;
  /** Bu özelliği içeren plan kimlikleri. */
  planIds: string[];
}

/**
 * Özellik matrisi: tüm planların özellik satırlarının birleşimi (ilk görülen yazım etiket olur),
 * plan sırasına göre, sonra kaç planda geçtiğine göre (çok yaygın olan üstte).
 */
export function buildFeatureMatrix(plans: ReadonlyArray<Pick<PlanSummary, 'id' | 'features'>>): MatrixRow[] {
  const rows = new Map<string, { label: string; planIds: string[]; first: number }>();
  let seq = 0;
  for (const p of plans) {
    for (const f of p.features) {
      const k = featureKey(f);
      if (!k) continue;
      const row = rows.get(k);
      if (row) {
        if (!row.planIds.includes(p.id)) row.planIds.push(p.id);
      } else {
        rows.set(k, { label: f.trim(), planIds: [p.id], first: seq++ });
      }
    }
  }
  return [...rows.entries()]
    .sort((a, b) => b[1].planIds.length - a[1].planIds.length || a[1].first - b[1].first)
    .map(([key, r]) => ({ key, label: r.label, planIds: r.planIds }));
}

/** Matris hücresi değişimi: özelliği plana ekler ya da plandan çıkarır (yazım korunur). */
export function toggleFeature(features: readonly string[], label: string, on: boolean): string[] {
  const k = featureKey(label);
  const without = features.filter((f) => featureKey(f) !== k);
  return on ? [...without, label.trim()] : without;
}

// ───────────────────────────── Stripe eşleme ─────────────────────────────

/** Stripe Price'ın karşılaştırmaya giren alanları (stripe tipinden bağımsız). */
export interface StripePriceShape {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  type: 'one_time' | 'recurring';
  recurring: { interval: 'day' | 'week' | 'month' | 'year'; interval_count: number } | null;
  livemode: boolean;
  productName?: string | null;
}

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'XOF', 'XAF', 'UGX']);

export function stripeMajorAmount(unitAmount: number | null, currency: string): number | null {
  if (unitAmount == null) return null;
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? unitAmount : unitAmount / 100;
}

export function toStripeMinor(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? Math.round(amount) : Math.round(amount * 100);
}

export function stripeIntervalOf(p: Pick<StripePriceShape, 'type' | 'recurring'>): PlanInterval | 'other' {
  if (p.type === 'one_time') return 'lifetime';
  const r = p.recurring;
  if (!r) return 'other';
  if (r.interval === 'month' && r.interval_count === 1) return 'monthly';
  if ((r.interval === 'year' && r.interval_count === 1) || (r.interval === 'month' && r.interval_count === 12)) return 'yearly';
  return 'other';
}

export type StripeCheckStatus = 'match' | 'mismatch' | 'inactive' | 'not_found' | 'not_configured' | 'unmapped' | 'error';

export interface StripeCheck {
  planId: string | null;
  stripePriceId: string | null;
  status: StripeCheckStatus;
  /** Stripe tarafındaki değerler (bulunduysa). */
  stripe: { amount: number | null; currency: string; interval: PlanInterval | 'other'; active: boolean; livemode: boolean; productName: string | null } | null;
  /** Türkçe uyuşmazlık açıklamaları. */
  mismatches: string[];
  message: string;
}

export function compareStripePrice(
  expected: { price: number; currency: string; interval: PlanInterval },
  sp: StripePriceShape
): { mismatches: string[]; status: 'match' | 'mismatch' | 'inactive' } {
  const mismatches: string[] = [];
  const cur = sp.currency.toUpperCase();
  if (cur !== expected.currency.toUpperCase()) mismatches.push(`Para birimi farklı: Stripe ${cur}, plan ${expected.currency.toUpperCase()}`);
  const amount = stripeMajorAmount(sp.unit_amount, cur);
  if (amount == null) mismatches.push('Stripe fiyatında sabit tutar yok (kademeli/kullanıma göre fiyat desteklenmez)');
  else if (Math.round(amount * 100) !== Math.round(expected.price * 100)) {
    mismatches.push(`Tutar farklı: Stripe ${formatMoney(amount, cur)}, plan ${formatMoney(expected.price, expected.currency)}`);
  }
  const si = stripeIntervalOf(sp);
  if (si !== expected.interval) {
    const label = si === 'other' ? 'desteklenmeyen döngü' : INTERVAL_LABEL[si].toLocaleLowerCase('tr-TR');
    mismatches.push(`Döngü farklı: Stripe ${label}, plan ${INTERVAL_LABEL[expected.interval].toLocaleLowerCase('tr-TR')}`);
  }
  if (!sp.active) return { mismatches: ['Stripe fiyatı pasif (arşivlenmiş)', ...mismatches], status: 'inactive' };
  return { mismatches, status: mismatches.length ? 'mismatch' : 'match' };
}

// ───────────────────────────── Yanıt tipleri ─────────────────────────────

export interface PlanSubscribers {
  /** Plana atanmış tüm işletmeler (elle atanmış dahil). */
  total: number;
  /** Stripe aboneliği plan veren durumda (active/trialing/past_due). */
  paying: number;
  /** Ödemesi geciken (past_due) — `paying` içinde. */
  pastDue: number;
  /** Stripe aboneliği olmadan (elle) atanmış. */
  manual: number;
}

export interface PlanSummary {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  interval: PlanInterval;
  features: string[];
  maxQRCodes: number | null;
  maxBranches: number | null;
  stripePriceId: string | null;
  isPopular: boolean;
  isActive: boolean;
  archivedAt: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  subscribers: PlanSubscribers;
  /** Ödeyen abonelerden liste fiyatıyla aylık eşdeğer (tahmini). */
  mrr: number;
  lastChange: { at: string; by: string | null; action: string } | null;
}

export interface PricingOverview {
  plans: PlanSummary[];
  kpis: {
    payingSubscribers: number;
    assignedDealers: number;
    freeTierDealers: number;
    mrrByCurrency: Array<{ currency: string; amount: number }>;
    sellablePlans: number;
    /** Satışta, yinelenen ve Stripe fiyatı eşlenmemiş plan sayısı. */
    unmappedSellable: number;
  };
  stripe: { configured: boolean; mode: 'live' | 'test' | null };
  generatedAt: string;
}

export interface PlanHistoryItem {
  id: string;
  action: string;
  at: string;
  by: string | null;
  changes: Array<{ field: string; from: unknown; to: unknown }>;
}

export const ACTION_LABEL: Record<string, string> = {
  CREATE_PRICING_PLAN: 'Oluşturuldu',
  UPDATE_PRICING_PLAN: 'Güncellendi',
  ARCHIVE_PRICING_PLAN: 'Arşivlendi',
  RESTORE_PRICING_PLAN: 'Arşivden geri alındı',
  REORDER_PRICING_PLANS: 'Sıralama değişti',
  STRIPE_PRICE_CREATED: 'Stripe fiyatı oluşturuldu',
};

export const FIELD_LABEL: Record<string, string> = {
  name: 'Ad',
  description: 'Açıklama',
  price: 'Fiyat',
  currency: 'Para birimi',
  interval: 'Döngü',
  features: 'Özellikler',
  maxQRCodes: 'Maks QR',
  maxBranches: 'Maks şube',
  stripePriceId: 'Stripe fiyatı',
  isPopular: 'Öne çıkan',
  isActive: 'Satışta',
  archivedAt: 'Arşiv',
  order: 'Sıra',
};
