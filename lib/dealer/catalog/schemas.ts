/**
 * Ürün kataloğu — zod şemaları. TEK KAYNAK: hem `defineRoute` (sunucu) hem `useZodForm`
 * (istemci) bunları kullanır; sınırlar (100/500/50 karakter, fiyat üst sınırı) formda
 * önceden gösterilir, sunucu aynısını uygular (Bulgu 8).
 */
import { z } from 'zod';
import { MAX_PRICE_MINOR } from './money';
import { CSV_MAX_BYTES } from './csv';

export const PRODUCT_NAME_MAX = 100;
export const PRODUCT_DESCRIPTION_MAX = 500;
export const CATEGORY_NAME_MAX = 50;
export const BULK_MAX_IDS = 200;

/**
 * Kategori simgeleri — sabit küme (sunucu da doğrular; eskiden `icon` alanına sınırsız metin
 * yazılabiliyordu, Bulgu/envanter #22). Mevcut kayıtlardaki başka simgeler okunurken korunur.
 */
export const CATEGORY_ICONS = [
  '🍽️', '☕', '🍵', '🧃', '🥤', '🍺', '🍷', '🍸',
  '🍕', '🍔', '🌯', '🥙', '🍝', '🍜', '🍲', '🥗',
  '🥩', '🍗', '🐟', '🍳', '🥐', '🍰', '🍨', '🍩',
  '🍫', '🍪', '🍎', '🥜', '🛍️', '🎁', '💇', '✨',
] as const;

const id = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Geçersiz kimlik.');

const name = z
  .string({ required_error: 'Ürün adı gerekli.' })
  .trim()
  .min(1, 'Ürün adı gerekli.')
  .max(PRODUCT_NAME_MAX, `Ürün adı en fazla ${PRODUCT_NAME_MAX} karakter olabilir.`);

const description = z
  .string()
  .trim()
  .max(PRODUCT_DESCRIPTION_MAX, `Açıklama en fazla ${PRODUCT_DESCRIPTION_MAX} karakter olabilir.`)
  .nullable()
  .transform((v) => (v ? v : null));

const priceMinor = z
  .number({ invalid_type_error: 'Fiyat sayı olmalı.' })
  .int('Fiyat kuruş cinsinden tam sayı olmalı.')
  .min(0, 'Fiyat negatif olamaz.')
  .max(MAX_PRICE_MINOR, 'Fiyat en fazla 1.000.000 ₺ olabilir.')
  .nullable();

const image = z.string().trim().url('Görsel adresi geçersiz.').max(1000).nullable();

/** Ürün oluşturma (POST /api/dealer/products). */
export const productCreateSchema = z.object({
  name,
  description: description.optional().default(null),
  priceMinor: priceMinor.optional().default(null),
  categoryId: z.string({ required_error: 'Kategori seçin.' }).trim().min(1, 'Kategori seçin.').max(64),
  image: image.optional().default(null),
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;

/** Ürün güncelleme / geri yükleme (PATCH /api/dealer/products/[id]). */
export const productUpdateSchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
    priceMinor: priceMinor.optional(),
    categoryId: id.optional(),
    image: image.optional(),
    isActive: z.boolean().optional(),
    /** İyimser eşzamanlılık: formun açıldığı andaki `updatedAt` (farklıysa 409). */
    baseUpdatedAt: z.string().datetime().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== 'baseUpdatedAt'), { message: 'Değiştirilecek alan yok.' });
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

/** Form değerleri (istemci): fiyat `MoneyField` ile kuruş. */
export const productFormSchema = z.object({
  name,
  categoryId: z.string().trim().min(1, 'Kategori seçin.').max(64),
  priceMinor,
  description: z
    .string()
    .trim()
    .max(PRODUCT_DESCRIPTION_MAX, `Açıklama en fazla ${PRODUCT_DESCRIPTION_MAX} karakter olabilir.`)
    .nullable(),
  /** Yüklenen görselin URL'si (sunucu yalnız bu bayinin R2 alanını kabul eder). */
  image: z.string().max(1000).nullable(),
});
export type ProductFormValues = z.infer<typeof productFormSchema>;

const categoryName = z
  .string({ required_error: 'Kategori adı gerekli.' })
  .trim()
  .min(1, 'Kategori adı gerekli.')
  .max(CATEGORY_NAME_MAX, `Kategori adı en fazla ${CATEGORY_NAME_MAX} karakter olabilir.`);

const categoryIcon = z.enum(CATEGORY_ICONS, { errorMap: () => ({ message: 'Listeden bir simge seçin.' }) });

export const categoryCreateSchema = z.object({
  name: categoryName,
  icon: categoryIcon.optional().default('🍽️'),
});
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

export const categoryUpdateSchema = z
  .object({ name: categoryName.optional(), icon: categoryIcon.optional() })
  .strict()
  .refine((v) => v.name !== undefined || v.icon !== undefined, { message: 'Değiştirilecek alan yok.' });

/** Kategori arşivleme: içinde aktif ürün varsa hedef kategori zorunlu. */
export const categoryArchiveSchema = z.object({ moveToCategoryId: id.nullable().optional() }).optional();

export const categoryReorderSchema = z.object({
  ids: z
    .array(id)
    .min(1)
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Aynı kategori iki kez gönderilemez.' }),
});

/** Toplu işlem (POST /api/dealer/products/bulk). */
export const productBulkSchema = z
  .object({
    ids: z
      .array(id)
      .min(1, 'En az bir ürün seçin.')
      .max(BULK_MAX_IDS, `Tek seferde en fazla ${BULK_MAX_IDS} ürün.`)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'Aynı ürün iki kez gönderilemez.' }),
    action: z.enum(['archive', 'restore', 'move', 'adjustPrice']),
    categoryId: id.optional(),
    /** Yüzde (−90 … +500, en fazla 1 ondalık). */
    percent: z
      .number()
      .min(-90, 'En fazla %90 indirim.')
      .max(500, 'En fazla %500 artış.')
      .refine((p) => Math.abs(Math.round(p * 10) - p * 10) < 1e-9, { message: 'En fazla bir ondalık hane.' })
      .refine((p) => p !== 0, { message: 'Yüzde sıfır olamaz.' })
      .optional(),
    /** Yuvarlama adımı (kuruş): 1 = yok, 50 = ,00/,50, 100 = tam lira. */
    roundTo: z.union([z.literal(1), z.literal(50), z.literal(100)]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action === 'move' && !v.categoryId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['categoryId'], message: 'Hedef kategori seçin.' });
    }
    if (v.action === 'adjustPrice' && v.percent === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['percent'], message: 'Yüzde girin.' });
    }
  });
export type ProductBulkInput = z.infer<typeof productBulkSchema>;

/** CSV içe aktarma (POST /api/dealer/products/import): önce önizleme, sonra `commit`. */
export const productImportSchema = z.object({
  csv: z
    .string()
    .min(1, 'Dosya boş.')
    .refine((s) => new TextEncoder().encode(s).length <= CSV_MAX_BYTES, { message: 'Dosya en fazla 512 KB olabilir.' }),
  onDuplicate: z.enum(['skip', 'update']).default('skip'),
  commit: z.boolean().default(false),
});
export type ProductImportInput = z.infer<typeof productImportSchema>;

// ───────────────────────────── Liste sorgusu ─────────────────────────────

export const CATALOG_SORT_IDS = ['name', 'price', 'consumptions', 'rating', 'createdAt'] as const;
export type CatalogSortId = (typeof CATALOG_SORT_IDS)[number];
export const CATALOG_PAGE_SIZES = [12, 24, 48, 96] as const;
export const CATALOG_DEFAULT_PAGE_SIZE = 24;

export type CatalogQuery = {
  q: string;
  category: string | null;
  status: 'active' | 'archived';
  /** Yalnız fiyatı girilmemiş ürünler (`?missing=price`; içgörü kartından). */
  missingPrice: boolean;
  sort: CatalogSortId;
  desc: boolean;
  page: number;
  pageSize: number;
};

type ParamsLike = { get(key: string): string | null };

function first(v: string | string[] | undefined | null): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * URL → katalog sorgusu. Sunucu sayfası (ön yükleme), BFF ve istemci adası AYNI fonksiyonu
 * kullanır; böylece React Query anahtarı üç yerde birebir aynıdır. Geçersiz değerler
 * varsayılana düşer (hata değil: paylaşılan link bozulmaz).
 */
export function parseCatalogQuery(input: ParamsLike | Record<string, string | string[] | undefined>): CatalogQuery {
  const get = (k: string): string | null =>
    typeof (input as ParamsLike).get === 'function'
      ? (input as ParamsLike).get(k)
      : first((input as Record<string, string | string[] | undefined>)[k]);
  const q = (get('q') ?? get('search') ?? '').trim().slice(0, 100);
  const catRaw = (get('category') ?? '').trim();
  const category = catRaw && catRaw.length <= 64 && /^[A-Za-z0-9_-]+$/.test(catRaw) ? catRaw : null;
  const status = get('status') === 'archived' ? 'archived' : 'active';
  const missingPrice = get('missing') === 'price';
  let sort: CatalogSortId = 'name';
  let desc = false;
  const sortRaw = (get('sort') ?? '').trim();
  if (sortRaw) {
    const dot = sortRaw.lastIndexOf('.');
    const sid = dot > 0 ? sortRaw.slice(0, dot) : sortRaw;
    const dir = dot > 0 ? sortRaw.slice(dot + 1) : 'asc';
    if ((CATALOG_SORT_IDS as readonly string[]).includes(sid) && (dir === 'asc' || dir === 'desc')) {
      sort = sid as CatalogSortId;
      desc = dir === 'desc';
    }
  }
  const pageNum = Number(get('page'));
  const page = Number.isInteger(pageNum) && pageNum >= 1 && pageNum <= 10_000 ? pageNum : 1;
  const sizeNum = Number(get('size'));
  const pageSize = (CATALOG_PAGE_SIZES as readonly number[]).includes(sizeNum) ? sizeNum : CATALOG_DEFAULT_PAGE_SIZE;
  return { q, category, status, missingPrice, sort, desc, page, pageSize };
}

/** React Query anahtarı (sunucu ön yüklemesi ile istemci aynı anahtarı üretir). */
export function catalogQueryKey(q: CatalogQuery) {
  return ['dealer-catalog', q.q, q.category ?? 'all', q.status, q.missingPrice ? 'noprice' : 'any', q.sort, q.desc ? 'desc' : 'asc', q.page, q.pageSize] as const;
}

export const CATALOG_QUERY_ROOT = ['dealer-catalog'] as const;
export const productDetailQueryKey = (productId: string) => ['dealer-catalog-product', productId] as const;

/** BFF sorgu dizgisi (istemci). */
export function catalogSearchString(q: CatalogQuery): string {
  const sp = new URLSearchParams();
  if (q.q) sp.set('q', q.q);
  if (q.category) sp.set('category', q.category);
  if (q.status !== 'active') sp.set('status', q.status);
  if (q.missingPrice) sp.set('missing', 'price');
  if (q.sort !== 'name' || q.desc) sp.set('sort', `${q.sort}.${q.desc ? 'desc' : 'asc'}`);
  if (q.page > 1) sp.set('page', String(q.page));
  if (q.pageSize !== CATALOG_DEFAULT_PAGE_SIZE) sp.set('size', String(q.pageSize));
  const s = sp.toString();
  return s ? `?${s}` : '';
}
