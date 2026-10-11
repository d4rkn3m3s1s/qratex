/**
 * Admin → Fiziksel Kartlar (Dalga 2) sözleşmesi — istemci ve sunucu aynı şemaları kullanır.
 *
 * Durum makinesi `lib/cards/lifecycle.ts`'tedir; bu dosya yalnız sorgu/gövde şemaları, tipler,
 * blok gerekçe kategorileri ve token normalizasyonu taşır (saf, test edilir).
 */
import { z } from 'zod';

export const CARD_STATUSES = ['UNUSED', 'ACTIVATED', 'BLOCKED'] as const;
export type CardStatusValue = (typeof CARD_STATUSES)[number];

/** Liste görünümündeki durum filtresi: üç durum + arşiv. */
export const CARD_VIEW_STATUSES = ['UNUSED', 'ACTIVATED', 'BLOCKED', 'ARCHIVED'] as const;
export type CardViewStatus = (typeof CARD_VIEW_STATUSES)[number];

export const CARD_SORT_IDS = ['createdAt', 'activatedAt', 'consumptions'] as const;
export const CARD_DEFAULT_SORT = 'createdAt.desc';
export const CARD_PAGE_SIZE = 20;
export const CARD_PAGE_SIZES = [20, 50, 100] as const;
export const CARD_EXPORT_MAX = 10_000;
export const PRINT_PAGE_SIZE = 120;
export const IDLE_DAYS = 30;

const sortRe = new RegExp(`^(${CARD_SORT_IDS.join('|')})\\.(asc|desc)$`);

const emptyToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const cardFiltersSchema = z.object({
  q: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  status: z.preprocess(emptyToUndef, z.enum(CARD_VIEW_STATUSES).optional()),
  batch: z.preprocess(emptyToUndef, z.string().trim().max(64).optional()),
  /** `none`: hiç tüketimi yok · `any`: en az bir tüketim · `idle`: aktif ama son 30 günde tüketim yok. */
  usage: z.preprocess(emptyToUndef, z.enum(['none', 'any', 'idle']).optional()),
});
export type CardFilters = z.infer<typeof cardFiltersSchema>;

export const cardListQuerySchema = cardFiltersSchema.extend({
  sort: z.preprocess(emptyToUndef, z.string().regex(sortRe).optional()),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  size: z.coerce
    .number()
    .int()
    .refine((n) => (CARD_PAGE_SIZES as readonly number[]).includes(n), 'Geçersiz sayfa boyutu')
    .default(CARD_PAGE_SIZE),
});
export type CardListQuery = z.infer<typeof cardListQuerySchema>;

export const BLOCK_REASONS = {
  LOST: 'Kayıp',
  STOLEN: 'Çalıntı',
  FRAUD: 'Sahte / şüpheli kullanım',
  DAMAGED: 'Hasarlı / hatalı baskı',
  SHIPMENT: 'Kayıp sevkiyat',
  OTHER: 'Diğer',
} as const;
export type BlockReasonCode = keyof typeof BLOCK_REASONS;
export const BLOCK_REASON_CODES = Object.keys(BLOCK_REASONS) as BlockReasonCode[];

/** Gerekçe kodu + not → kartta saklanan okunur blok gerekçesi. */
export function composeBlockReason(code: BlockReasonCode, note?: string | null): string {
  const n = note?.trim();
  return (n ? `${BLOCK_REASONS[code]}: ${n}` : BLOCK_REASONS[code]).slice(0, 500);
}

export const bulkBodySchema = z
  .object({
    action: z.enum(['block', 'unblock', 'archive']),
    ids: z.array(z.string().min(1).max(64)).min(1).max(500).optional(),
    /** Partinin tamamı (kayıp sevkiyat). `ids` ile birlikte verilemez. */
    batchId: z.string().min(1).max(64).optional(),
    reasonCode: z.enum(BLOCK_REASON_CODES as [BlockReasonCode, ...BlockReasonCode[]]).optional(),
    note: z.string().trim().max(300).optional(),
    notify: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.ids === !v.batchId) ctx.addIssue({ code: 'custom', path: ['ids'], message: 'Kart listesi ya da parti seçilmeli (ikisi birden değil).' });
    if (v.action === 'block' && !v.reasonCode) ctx.addIssue({ code: 'custom', path: ['reasonCode'], message: 'Blok gerekçesi seçin.' });
    if (v.action === 'block' && v.reasonCode === 'OTHER' && !(v.note && v.note.length >= 3))
      ctx.addIssue({ code: 'custom', path: ['note'], message: '"Diğer" için en az 3 karakterlik açıklama yazın.' });
  });
export type BulkBody = z.infer<typeof bulkBodySchema>;

export const generateBodySchema = z.object({
  batchName: z.string().trim().min(2, 'Parti adı en az 2 karakter olmalı').max(100, 'Parti adı en fazla 100 karakter olabilir'),
  quantity: z.number().int('Adet tam sayı olmalı').min(1, 'En az 1 kart üretilmeli').max(10_000, 'Tek seferde en fazla 10.000 kart üretilebilir'),
  prefix: z
    .string()
    .trim()
    .max(10, 'Token öneki en fazla 10 karakter olabilir')
    .regex(/^[A-Za-z0-9]*$/, 'Token öneki yalnız harf ve rakam içerebilir')
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type GenerateBody = z.infer<typeof generateBodySchema>;

export const assignBodySchema = z.object({ customerId: z.string().min(1, 'Müşteri seçin').max(64) });

export const customerLookupQuerySchema = z.object({ q: z.preprocess(emptyToUndef, z.string().trim().max(120).optional()) });

export const exportQuerySchema = cardFiltersSchema.extend({ sort: z.preprocess(emptyToUndef, z.string().regex(sortRe).optional()) });

export const batchListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  size: z.coerce.number().int().min(5).max(100).default(20),
  q: z.preprocess(emptyToUndef, z.string().trim().max(100).optional()),
});

/**
 * Arama kutusuna yapıştırılan kart URL'sini (…/c/TOKEN?x) ya da boşluklu kodu tokena indirger.
 * Token büyük/küçük harf duyarlıdır; değiştirilmez.
 */
export function normalizeCardSearch(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim();
  const m = s.match(/\/c\/([^/?#\s]+)/);
  if (m) {
    try {
      s = decodeURIComponent(m[1]);
    } catch {
      s = m[1];
    }
  }
  if (/^[A-Za-z0-9]{2,}( [A-Za-z0-9]{1,})+$/.test(s)) s = s.replace(/ /g, '');
  return s || undefined;
}

export function cardQueryString(p: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

// ───────────────────────────── Yanıt tipleri ─────────────────────────────

export type CardCustomer = { id: string; name: string | null; email: string; image: string | null };

export type CardListItem = {
  id: string;
  token: string;
  url: string;
  status: CardStatusValue;
  archived: boolean;
  batchId: string | null;
  batchName: string | null;
  customer: CardCustomer | null;
  consumptions: number;
  lastConsumptionAt: string | null;
  activatedAt: string | null;
  blockedAt: string | null;
  blockReason: string | null;
  createdAt: string;
};

export type CardListPage = { items: CardListItem[]; total: number; page: number; size: number; pageCount: number };

export type CardStats = {
  total: number;
  UNUSED: number;
  ACTIVATED: number;
  BLOCKED: number;
  archived: number;
  /** Son 7 günde (İstanbul) aktive edilen kart. */
  activatedLast7d: number;
  /** Aktif ama son 30 günde tüketimi olmayan. */
  idleActive: number;
};

export type BatchRow = {
  id: string;
  name: string;
  prefix: string | null;
  quantity: number;
  createdAt: string;
  createdBy: { id: string; name: string | null; email: string } | null;
  counts: { UNUSED: number; ACTIVATED: number; BLOCKED: number; archived: number; total: number };
  lastExportedAt: string | null;
  exportCount: number;
};

export type BatchPage = { items: BatchRow[]; total: number; page: number; size: number; pageCount: number };

export type CardTimelineEvent = {
  id: string;
  kind: 'audit' | 'consumption';
  action: string;
  title: string;
  description: string | null;
  at: string;
  actor: string | null;
  tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
};

export type CardDetail = CardListItem & {
  batchCreatedAt: string | null;
  updatedAt: string;
  allowed: { assign: boolean; unassign: boolean; block: boolean; unblock: boolean; archive: boolean };
  unblockTo: CardStatusValue | null;
  consumptionsRecent: Array<{
    id: string;
    createdAt: string;
    dealerName: string | null;
    productName: string | null;
    amount: number | null;
    rating: number | null;
  }>;
  timeline: CardTimelineEvent[];
};

export type CustomerOption = { id: string; name: string | null; email: string; activeCards: number };

export type BulkResult = {
  action: BulkBody['action'];
  matched: number;
  done: number;
  skipped: Array<{ id: string; token: string; reason: string }>;
  dryRun: boolean;
};

export type GenerateResult = { batch: { id: string; name: string; quantity: number; prefix: string | null; createdAt: string }; created: number };
