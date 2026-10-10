/**
 * Ürün kataloğu — saf hesap çekirdeği (Jest ile test edilir; Prisma yok).
 *
 * Sunucu (`server.ts`) ham satırları okur, burada:
 *  - ürün başına son 30 / önceki 30 gün tüketim + değerlendirme özeti (İstanbul günü sınırı),
 *  - Türkçe duyarlı arama + sıralama + sayfalama (Bulgu 4, envanter #7/#35/#41),
 *  - eyleme dönük içgörüler (en çok tüketilen, en düşük puanlı, fiyatsız ürün),
 *  - CSV içe aktarma doğrulama raporu (önizleme = commit ile aynı karar),
 *  - görsel URL'sinin bu bayinin R2 alanına ait olduğunun denetimi
 * hesaplanır.
 */
import { EXPORT_HEADER, IMPORT_MAX_ROWS, mapHeader, parseCsv } from './csv';
import { minorToPlain, parsePriceToMinor, priceToMinor } from './money';
import { CATEGORY_NAME_MAX, PRODUCT_DESCRIPTION_MAX, PRODUCT_NAME_MAX, type CatalogQuery } from './schemas';
import { matchesSearch, normalizeForSearch, trCollator } from './text';
import type {
  CatalogCategoryDto,
  CatalogInsightsDto,
  CatalogProductDto,
  ImportReportDto,
  ImportRowReport,
  ProductStatsDto,
} from './types';

// ───────────────────────────── Zaman (Europe/Istanbul) ─────────────────────────────

/** Türkiye 2016'dan beri sabit UTC+3 (yaz saati yok). */
const IST_OFFSET_MS = 3 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const STATS_WINDOW_DAYS = 30;
/** "En düşük puanlı" için gereken en az değerlendirme (tek kötü yorumla ürün damgalanmasın). */
export const LOWEST_RATED_MIN_REVIEWS = 3;

/** `at` anının İstanbul gününün başlangıcı (UTC Date). */
export function istanbulDayStart(at: Date): Date {
  const shifted = at.getTime() + IST_OFFSET_MS;
  return new Date(shifted - (((shifted % DAY_MS) + DAY_MS) % DAY_MS) - IST_OFFSET_MS);
}

/** İstanbul haftası (Pazartesi 00:00) başlangıcı. */
export function istanbulWeekStart(at: Date): Date {
  const day = istanbulDayStart(at);
  const dow = new Date(day.getTime() + IST_OFFSET_MS).getUTCDay(); // 0 = Pazar
  const back = (dow + 6) % 7;
  return new Date(day.getTime() - back * DAY_MS);
}

/** İstanbul takvim günü `YYYY-MM-DD`. */
export function istanbulYmd(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Pencereler: son 30 gün = bugün dahil 30 İstanbul günü; önceki 30 gün hemen öncesi.
 * `[prevStart, curStart)` ve `[curStart, now]`.
 */
export function statsWindows(now: Date): { curStart: Date; prevStart: Date } {
  const today = istanbulDayStart(now);
  const curStart = new Date(today.getTime() - (STATS_WINDOW_DAYS - 1) * DAY_MS);
  const prevStart = new Date(curStart.getTime() - STATS_WINDOW_DAYS * DAY_MS);
  return { curStart, prevStart };
}

// ───────────────────────────── İstatistik ─────────────────────────────

export type CountRow = { productId: string | null; count: number };
export type ReviewRow = { productId: string | null; rating: number; createdAt: Date };

export const EMPTY_STATS: ProductStatsDto = Object.freeze({
  consumptions30: 0,
  consumptionsPrev30: 0,
  reviews30: 0,
  avgRating30: null,
  low30: 0,
}) as ProductStatsDto;

/**
 * Ürün başına özet. `cur`/`prev` tüketim sayıları sunucuda `groupBy` ile pencere başına
 * hesaplanır; `reviews` en az `curStart`'tan itibaren okunur ve tarihi TÜKETİMİN tarihidir
 * (puan, ürünün o dönemki deneyimini ölçer).
 */
export function computeProductStats(
  counts: { cur: readonly CountRow[]; prev: readonly CountRow[] },
  reviews: readonly ReviewRow[],
  now: Date
): Map<string, ProductStatsDto> {
  const { curStart } = statsWindows(now);
  const acc = new Map<string, { c: number; p: number; n: number; sum: number; low: number }>();
  const get = (id: string) => {
    let a = acc.get(id);
    if (!a) {
      a = { c: 0, p: 0, n: 0, sum: 0, low: 0 };
      acc.set(id, a);
    }
    return a;
  };
  for (const row of counts.cur) if (row.productId && row.count > 0) get(row.productId).c += row.count;
  for (const row of counts.prev) if (row.productId && row.count > 0) get(row.productId).p += row.count;
  for (const row of reviews) {
    if (!row.productId) continue;
    if (row.createdAt.getTime() < curStart.getTime()) continue;
    const rating = Math.round(row.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) continue;
    const a = get(row.productId);
    a.n += 1;
    a.sum += rating;
    if (rating <= 2) a.low += 1;
  }
  const out = new Map<string, ProductStatsDto>();
  for (const [id, a] of acc) {
    out.set(id, {
      consumptions30: a.c,
      consumptionsPrev30: a.p,
      reviews30: a.n,
      avgRating30: a.n > 0 ? Math.round((a.sum / a.n) * 10) / 10 : null,
      low30: a.low,
    });
  }
  return out;
}

// ───────────────────────────── Liste ─────────────────────────────

export type RawCategory = { id: string; name: string; icon: string; order: number; dealerId: string | null; isActive: boolean };
export type RawProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  image: string | null;
  isActive: boolean;
  dealerId: string | null;
  categoryId: string;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string; icon: string; isActive: boolean };
};

export function toProductDto(p: RawProduct, dealerId: string, stats: ProductStatsDto | undefined, canWrite: boolean): CatalogProductDto {
  const isGlobal = p.dealerId === null;
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    priceMinor: priceToMinor(p.price),
    image: p.image,
    isActive: p.isActive,
    isGlobal,
    canEdit: canWrite && !isGlobal && p.dealerId === dealerId,
    category: { id: p.category.id, name: p.category.name, icon: p.category.icon, isActive: p.category.isActive },
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    stats: stats ?? EMPTY_STATS,
  };
}

/** Kategoriler: bayinin (aktif + arşivli) ve sistemin aktif kategorileri; sayılar yalnız görünür ürünlerden (Bulgu 10). */
export function buildCategoryDtos(
  categories: readonly RawCategory[],
  products: readonly RawProduct[],
  dealerId: string,
  canWrite: boolean
): CatalogCategoryDto[] {
  const active = new Map<string, number>();
  const archived = new Map<string, number>();
  for (const p of products) {
    const m = p.isActive ? active : archived;
    m.set(p.categoryId, (m.get(p.categoryId) ?? 0) + 1);
  }
  return categories
    .map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      order: c.order,
      isGlobal: c.dealerId === null,
      isActive: c.isActive,
      canEdit: canWrite && c.dealerId === dealerId,
      activeCount: active.get(c.id) ?? 0,
      archivedCount: archived.get(c.id) ?? 0,
    }))
    .sort((a, b) => a.order - b.order || trCollator.compare(a.name, b.name));
}

function compareProducts(a: CatalogProductDto, b: CatalogProductDto, q: CatalogQuery): number {
  const dir = q.desc ? -1 : 1;
  const byName = trCollator.compare(a.name, b.name);
  // Değeri olmayan (fiyatsız / puansız) ürünler yönden bağımsız EN SONA.
  const nullsLast = (x: number | null, y: number | null): number | null => {
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return null;
  };
  switch (q.sort) {
    case 'price': {
      const n = nullsLast(a.priceMinor, b.priceMinor);
      if (n !== null) return n || byName;
      return dir * ((a.priceMinor as number) - (b.priceMinor as number)) || byName;
    }
    case 'rating': {
      const n = nullsLast(a.stats.avgRating30, b.stats.avgRating30);
      if (n !== null) return n || byName;
      return (
        dir * ((a.stats.avgRating30 as number) - (b.stats.avgRating30 as number)) ||
        b.stats.reviews30 - a.stats.reviews30 ||
        byName
      );
    }
    case 'consumptions':
      return dir * (a.stats.consumptions30 - b.stats.consumptions30) || byName;
    case 'createdAt':
      return dir * (Date.parse(a.createdAt) - Date.parse(b.createdAt)) || byName;
    case 'name':
    default:
      return dir * byName;
  }
}

/** Arama (ad + açıklama + kategori; Türkçe duyarlı) + kategori/durum filtresi + sıralama + sayfa. */
export function selectCatalogPage(
  all: readonly CatalogProductDto[],
  q: CatalogQuery
): { items: CatalogProductDto[]; total: number; page: number } {
  const wantActive = q.status === 'active';
  const filtered = all.filter(
    (p) =>
      p.isActive === wantActive &&
      (!q.category || p.category.id === q.category) &&
      (!q.missingPrice || p.priceMinor === null) &&
      matchesSearch([p.name, p.description, p.category.name], q.q)
  );
  filtered.sort((a, b) => compareProducts(a, b, q));
  const total = filtered.length;
  const lastPage = Math.max(1, Math.ceil(total / q.pageSize));
  const page = Math.min(q.page, lastPage);
  const start = (page - 1) * q.pageSize;
  return { items: filtered.slice(start, start + q.pageSize), total, page };
}

export function buildInsights(all: readonly CatalogProductDto[]): CatalogInsightsDto {
  let activeCount = 0;
  let archivedCount = 0;
  let missingPrice = 0;
  let consumptionsWithProduct30 = 0;
  let top: CatalogInsightsDto['topConsumed'] = null;
  let low: CatalogInsightsDto['lowestRated'] = null;
  for (const p of all) {
    consumptionsWithProduct30 += p.stats.consumptions30;
    if (!p.isActive) {
      archivedCount += 1;
      continue;
    }
    activeCount += 1;
    if (p.priceMinor === null) missingPrice += 1;
    const c = p.stats.consumptions30;
    if (c > 0 && (!top || c > top.count || (c === top.count && trCollator.compare(p.name, top.name) < 0))) {
      top = { id: p.id, name: p.name, count: c };
    }
    const avg = p.stats.avgRating30;
    if (avg !== null && p.stats.reviews30 >= LOWEST_RATED_MIN_REVIEWS) {
      if (!low || avg < low.avg || (avg === low.avg && p.stats.reviews30 > low.reviews)) {
        low = { id: p.id, name: p.name, avg, reviews: p.stats.reviews30 };
      }
    }
  }
  return {
    windowDays: STATS_WINDOW_DAYS,
    activeCount,
    archivedCount,
    missingPrice,
    topConsumed: top,
    lowestRated: low,
    minReviews: LOWEST_RATED_MIN_REVIEWS,
    consumptionsWithProduct30,
  };
}

/** Haftalık seri (son 8 İstanbul haftası) — ürün detayı. */
export function weeklySeries(
  consumptions: readonly { createdAt: Date; rating: number | null }[],
  now: Date,
  weeks = 8
): Array<{ weekStart: string; consumptions: number; avgRating: number | null }> {
  const thisWeek = istanbulWeekStart(now).getTime();
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    start: thisWeek - (weeks - 1 - i) * 7 * DAY_MS,
    c: 0,
    n: 0,
    sum: 0,
  }));
  const first = buckets[0].start;
  for (const row of consumptions) {
    const t = row.createdAt.getTime();
    if (t < first) continue;
    const idx = Math.min(weeks - 1, Math.floor((t - first) / (7 * DAY_MS)));
    const b = buckets[idx];
    b.c += 1;
    if (row.rating !== null && row.rating >= 1 && row.rating <= 5) {
      b.n += 1;
      b.sum += row.rating;
    }
  }
  return buckets.map((b) => ({
    weekStart: istanbulYmd(new Date(b.start)),
    consumptions: b.c,
    avgRating: b.n > 0 ? Math.round((b.sum / b.n) * 10) / 10 : null,
  }));
}

// ───────────────────────────── Görsel ─────────────────────────────

export const PRODUCT_IMAGE_PREFIX = 'products/';
const IMAGE_KEY_RE = /^products\/[A-Za-z0-9_-]{1,64}\/\d{4}-\d{2}\/[A-Za-z0-9_-]{16,64}\.jpg$/;

/** R2 nesne anahtarı: `products/<dealerId>/<yyyy-mm>/<rastgele>.jpg`. */
export function productImageKey(dealerId: string, random: string, now: Date = new Date()): string {
  const safe = dealerId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'dealer';
  return `${PRODUCT_IMAGE_PREFIX}${safe}/${istanbulYmd(now).slice(0, 7)}/${random}.jpg`;
}

/**
 * Ürüne yazılabilecek görsel: yalnız BU bayinin `products/` alanındaki R2 nesnesi (harici URL,
 * data: URI ya da başka bayinin görseli reddedilir — eskiden `z.string().url()` her şeyi alıyordu).
 */
export function isAcceptedProductImage(url: string, dealerId: string, publicBase: string | null): boolean {
  if (!publicBase) return false;
  const base = publicBase.replace(/\/$/, '');
  if (!url.startsWith(`${base}/`)) return false;
  const key = url.slice(base.length + 1);
  if (!IMAGE_KEY_RE.test(key)) return false;
  const safe = dealerId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return key.startsWith(`${PRODUCT_IMAGE_PREFIX}${safe}/`);
}

// ───────────────────────────── CSV ─────────────────────────────

export type ExportRow = { name: string; categoryName: string; priceMinor: number | null; description: string | null };

export function exportRows(products: readonly ExportRow[]): string[][] {
  return [
    [...EXPORT_HEADER],
    ...products.map((p) => [p.name, p.categoryName, minorToPlain(p.priceMinor), p.description ?? '']),
  ];
}

export type ImportContext = {
  /** Görünür aktif kategoriler (bayi + sistem). */
  categories: ReadonlyArray<{ id: string; name: string }>;
  /** Bayinin AKTİF ürünleri (yinelenen tespiti). */
  products: ReadonlyArray<{ id: string; name: string }>;
};

const PRICE_ERRORS: Record<'format' | 'negative' | 'precision' | 'max', string> = {
  format: 'Fiyat okunamadı (ör. 45 ya da 45,50).',
  negative: 'Fiyat negatif olamaz.',
  precision: 'Fiyatta en fazla 2 ondalık hane olabilir.',
  max: 'Fiyat en fazla 1.000.000 ₺ olabilir.',
};

/**
 * CSV → satır satır karar. Önizleme ve commit AYNI fonksiyonu çağırır; commit yalnız
 * `create`/`update` satırlarını yazar. Hatalı satır olsa da geçerli satırlar içe aktarılabilir
 * (rapor açıkça gösterir).
 */
export function buildImportReport(csvText: string, ctx: ImportContext, onDuplicate: 'skip' | 'update'): ImportReportDto {
  const empty = (fileError: string): ImportReportDto => ({
    committed: false,
    fileError,
    rows: [],
    summary: { create: 0, update: 0, skip: 0, error: 0, newCategories: [] },
  });
  const table = parseCsv(csvText);
  if (table.length === 0) return empty('Dosyada satır bulunamadı.');
  const header = mapHeader(table[0]);
  if (header.name === undefined || header.category === undefined) {
    return empty('Başlık satırında en az "Ürün adı" ve "Kategori" sütunları olmalı.');
  }
  const body = table.slice(1);
  if (body.length === 0) return empty('Başlıktan sonra ürün satırı yok.');
  if (body.length > IMPORT_MAX_ROWS) return empty(`Tek seferde en fazla ${IMPORT_MAX_ROWS} satır içe aktarılabilir.`);

  const catByName = new Map<string, string>();
  for (const c of ctx.categories) {
    const k = normalizeForSearch(c.name);
    if (k && !catByName.has(k)) catByName.set(k, c.id);
  }
  const prodByName = new Map<string, string>();
  for (const p of ctx.products) {
    const k = normalizeForSearch(p.name);
    if (k && !prodByName.has(k)) prodByName.set(k, p.id);
  }
  const seenInFile = new Map<string, number>();
  const newCats = new Map<string, string>(); // normalize → görünen ad

  const cell = (row: string[], idx: number | undefined) => (idx === undefined ? '' : (row[idx] ?? '').trim());
  const rows: ImportRowReport[] = body.map((row, i) => {
    const line = i + 2;
    const name = cell(row, header.name).replace(/\s+/g, ' ');
    const categoryName = cell(row, header.category).replace(/\s+/g, ' ');
    const descRaw = cell(row, header.description);
    const errors: string[] = [];
    if (!name) errors.push('Ürün adı boş.');
    else if (name.length > PRODUCT_NAME_MAX) errors.push(`Ürün adı en fazla ${PRODUCT_NAME_MAX} karakter olabilir.`);
    if (!categoryName) errors.push('Kategori boş.');
    else if (categoryName.length > CATEGORY_NAME_MAX) errors.push(`Kategori adı en fazla ${CATEGORY_NAME_MAX} karakter olabilir.`);
    if (descRaw.length > PRODUCT_DESCRIPTION_MAX) errors.push(`Açıklama en fazla ${PRODUCT_DESCRIPTION_MAX} karakter olabilir.`);
    const price = parsePriceToMinor(cell(row, header.price));
    if (!price.ok) errors.push(PRICE_ERRORS[price.reason]);

    const key = normalizeForSearch(name);
    const catKey = normalizeForSearch(categoryName);
    if (key && seenInFile.has(key)) errors.push(`Aynı ürün dosyada ${seenInFile.get(key)}. satırda da var.`);
    if (key && !seenInFile.has(key)) seenInFile.set(key, line);

    const categoryId = catKey ? catByName.get(catKey) ?? null : null;
    const productId = key ? prodByName.get(key) ?? null : null;
    let status: ImportRowReport['status'];
    if (errors.length > 0) status = 'error';
    else if (productId) status = onDuplicate === 'update' ? 'update' : 'skip';
    else status = 'create';
    const newCategory = status !== 'error' && status !== 'skip' && !categoryId && !!catKey;
    if (newCategory && !newCats.has(catKey)) newCats.set(catKey, categoryName);
    return {
      line,
      name,
      categoryName,
      priceMinor: price.ok ? price.minor : null,
      description: descRaw || null,
      status,
      errors,
      categoryId,
      newCategory,
      productId,
    };
  });

  const summary = { create: 0, update: 0, skip: 0, error: 0, newCategories: [...newCats.values()] };
  for (const r of rows) summary[r.status] += 1;
  return { committed: false, fileError: null, rows, summary };
}
