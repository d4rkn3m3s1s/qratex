/**
 * Admin → Kuponlar (Dalga 2) — istemci + sunucu ortak sözleşme (tek şema, Türkçe mesajlar).
 *
 * Kuponun bugünkü anlamı (rapor Bulgu 1, dürüst çerçeve): Qratex'te ödeme/sepet akışı yok.
 * Kupon, sürpriz kutuyla müşteriye dağıtılan ve kasada gösterilen bir kampanya kodudur;
 * indirim işletme tarafından elle uygulanır. `minPurchase` hiçbir akışta denetlenmediği için
 * formdan KALDIRILDI (sütun şemada kalır, yeni kupona yazılmaz).
 */
import { z } from 'zod';

export const COUPON_PAGE_SIZE = 25;
export const COUPON_STATUSES = ['usable', 'expired', 'exhausted', 'inactive'] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];
export const COUPON_STATUS_FILTERS = ['usable', 'expired', 'exhausted', 'inactive', 'all'] as const;
export type CouponStatusFilter = (typeof COUPON_STATUS_FILTERS)[number];
export const COUPON_SORTS = ['new', 'used', 'expiring'] as const;
export type CouponSort = (typeof COUPON_SORTS)[number];
export const COUPON_TYPES = ['percentage', 'fixed'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const STATUS_LABEL: Record<CouponStatus, string> = {
  usable: 'Kullanılabilir',
  expired: 'Süresi doldu',
  exhausted: 'Limit doldu',
  inactive: 'Pasif',
};

export const TYPE_LABEL: Record<CouponType, string> = { percentage: 'Yüzde indirim', fixed: 'Sabit tutar (₺)' };

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREATE_COUPON: 'Oluşturuldu',
  UPDATE_COUPON: 'Düzenlendi',
  DEACTIVATE_COUPON: 'Pasifleştirildi',
  ACTIVATE_COUPON: 'Yeniden etkinleştirildi',
  CREATE_COUPON_BATCH: 'Toplu üretimde oluşturuldu',
};

const CODE_RE = /^[A-Z0-9_-]+$/;

export function normalizeCode(raw: string): string {
  return raw.trim().toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/\s+/g, '');
}

const codeField = z
  .string({ required_error: 'Kod girin' })
  .transform(normalizeCode)
  .pipe(
    z
      .string()
      .min(3, 'Kod en az 3 karakter olmalı')
      .max(40, 'Kod en fazla 40 karakter olabilir')
      .regex(CODE_RE, 'Kod yalnız harf (A–Z), rakam, - ve _ içerebilir')
  );

const valueField = z
  .number({ invalid_type_error: 'Değer sayı olmalı', required_error: 'Değer girin' })
  .positive('Değer 0’dan büyük olmalı')
  .max(100_000, 'Değer çok büyük');

/** null = sınırsız. */
const maxUsesField = z
  .number({ invalid_type_error: 'Kullanım limiti sayı olmalı' })
  .int('Kullanım limiti tam sayı olmalı')
  .min(1, 'Kullanım limiti en az 1 olmalı')
  .max(1_000_000, 'Kullanım limiti çok büyük')
  .nullable();

const expiresField = z.string().datetime({ offset: true, message: 'Geçerli bir tarih seçin' }).nullable();

function refinePercent<T extends { type?: CouponType; value?: number }>(v: T, ctx: z.RefinementCtx) {
  if (v.type === 'percentage' && typeof v.value === 'number' && v.value > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Yüzde indirim 100’den büyük olamaz' });
  }
}

export const couponCreateSchema = z
  .object({
    code: codeField,
    type: z.enum(COUPON_TYPES, { errorMap: () => ({ message: 'Tür seçin' }) }),
    value: valueField,
    maxUses: maxUsesField.default(null),
    expiresAt: expiresField.default(null),
  })
  .superRefine(refinePercent);
export type CouponCreateInput = z.infer<typeof couponCreateSchema>;

export const couponUpdateSchema = z
  .object({
    /** İyimser eşzamanlılık: okunan `updatedAt`. */
    baseVersion: z.string().datetime({ offset: true }),
    code: codeField.optional(),
    type: z.enum(COUPON_TYPES).optional(),
    value: valueField.optional(),
    maxUses: maxUsesField.optional(),
    expiresAt: expiresField.optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine(refinePercent);
export type CouponUpdateInput = z.infer<typeof couponUpdateSchema>;

export const couponBatchSchema = z
  .object({
    prefix: z
      .string()
      .transform(normalizeCode)
      .pipe(z.string().min(2, 'Önek en az 2 karakter olmalı').max(12, 'Önek en fazla 12 karakter olabilir').regex(/^[A-Z0-9]+$/, 'Önek yalnız harf ve rakam içerebilir')),
    count: z.number({ invalid_type_error: 'Adet sayı olmalı' }).int('Adet tam sayı olmalı').min(1, 'En az 1 kod').max(500, 'Tek seferde en fazla 500 kod'),
    type: z.enum(COUPON_TYPES),
    value: valueField,
    expiresAt: expiresField.default(null),
  })
  .superRefine(refinePercent);
export type CouponBatchInput = z.infer<typeof couponBatchSchema>;

export const couponListQuerySchema = z.object({
  q: z.string().trim().max(60).optional().transform((v) => (v && v.length >= 2 ? normalizeCode(v) : undefined)),
  status: z.enum(COUPON_STATUS_FILTERS).catch('usable').default('usable'),
  sort: z.enum(COUPON_SORTS).catch('new').default('new'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  size: z.coerce.number().int().min(5).max(100).catch(COUPON_PAGE_SIZE).default(COUPON_PAGE_SIZE),
});
export type CouponListQuery = z.infer<typeof couponListQuerySchema>;

export const couponIdSchema = z.object({ id: z.string().min(1).max(64) });

export interface CouponListItem {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  status: CouponStatus;
  createdAt: string;
  updatedAt: string;
}

export type CouponCounts = Record<CouponStatus, number>;

export interface CouponListPage {
  items: CouponListItem[];
  total: number;
  page: number;
  size: number;
  counts: CouponCounts;
}

export interface CouponStats {
  counts: CouponCounts;
  redemptions7d: number;
  /** Son 14 İstanbul günü, eskiden yeniye. */
  redemptions14d: number[];
  expiringSoon: number;
  /** Kod olarak sürpriz kutuya konmuş ve henüz açılmamış kutular. */
  boxesPending: number;
  boxesOpened: number;
}

export interface CouponDetail {
  coupon: CouponListItem;
  /** İlk kullanımdan sonra kod/tür/değer kilitlidir (geçmişi bozmamak için). */
  locked: boolean;
  redemptions: Array<{ userId: string; name: string | null; email: string | null; at: string }>;
  redemptions14d: number[];
  boxes: { total: number; opened: number };
  audit: Array<{ id: string; action: string; at: string; actorName: string | null; changes: string[] }>;
}

/** Durum tek yerden türer: pasif > süresi doldu > limit doldu > kullanılabilir. */
export function deriveCouponStatus(
  c: { isActive: boolean; expiresAt: Date | string | null; maxUses: number | null; usedCount: number },
  now: Date = new Date()
): CouponStatus {
  if (!c.isActive) return 'inactive';
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= now.getTime()) return 'expired';
  if (c.maxUses !== null && c.maxUses !== -1 && c.usedCount >= c.maxUses) return 'exhausted';
  return 'usable';
}

export function formatCouponValue(type: CouponType | string, value: number): string {
  return type === 'percentage' ? `%${value.toLocaleString('tr-TR')}` : `${value.toLocaleString('tr-TR')} ₺`;
}

export function couponQueryString(q: Partial<{ q: string; status: string; sort: string; page: number; size: number }>): string {
  const sp = new URLSearchParams();
  if (q.q && q.q.trim().length >= 2) sp.set('q', q.q.trim());
  if (q.status && q.status !== 'usable') sp.set('status', q.status);
  if (q.sort && q.sort !== 'new') sp.set('sort', q.sort);
  if (q.page && q.page > 1) sp.set('page', String(q.page));
  if (q.size && q.size !== COUPON_PAGE_SIZE) sp.set('size', String(q.size));
  return sp.toString();
}

/** CSV hücresi: formül enjeksiyonuna karşı `=+-@` ile başlayan değerlere tırnak öneki. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
