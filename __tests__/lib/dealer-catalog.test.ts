/**
 * /dealer/products (b-urunler) — katalog çekirdeği, sorgu sözleşmesi, CSV/para yardımcıları ve
 * yazma kuralları (Prisma sahte).
 */
jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/r2-storage', () => ({ uploadToR2: jest.fn(), isR2Configured: () => false }));
jest.mock('@/lib/feedback-funnel/media', () => ({
  feedbackPhotosEnabled: () => false,
  MAX_UPLOAD_BYTES: 4 * 1024 * 1024,
  processFeedbackPhoto: jest.fn(),
}));
jest.mock('@/lib/http/define-route', () => {
  class ApiError extends Error {
    code: string;
    status: number;
    details?: unknown;
    constructor(code: string, message?: string, init: { status?: number; details?: unknown } = {}) {
      super(message ?? code);
      this.code = code;
      this.status = init.status ?? 400;
      this.details = init.details;
    }
  }
  return { ApiError };
});
jest.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    productCategory: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { prisma } from '@/lib/prisma';
import {
  buildImportReport,
  buildInsights,
  computeProductStats,
  isAcceptedProductImage,
  istanbulDayStart,
  istanbulWeekStart,
  productImageKey,
  selectCatalogPage,
  statsWindows,
  toProductDto,
  weeklySeries,
  type RawProduct,
} from '@/lib/dealer/catalog/core';
import { adjustMinorByPercent, parsePriceToMinor, priceToMinor, minorToPrice } from '@/lib/dealer/catalog/money';
import { parseCsv, toCsv } from '@/lib/dealer/catalog/csv';
import { matchesSearch } from '@/lib/dealer/catalog/text';
import { catalogQueryKey, catalogSearchString, parseCatalogQuery, productBulkSchema, productUpdateSchema } from '@/lib/dealer/catalog/schemas';
import { archiveCategory, bulkProducts, createProduct, updateProduct } from '@/lib/dealer/catalog/mutations';

const db = prisma as unknown as {
  product: Record<string, jest.Mock>;
  productCategory: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

const NOW = new Date('2026-10-11T09:00:00Z'); // İstanbul 12:00, Pazar

function raw(over: Partial<RawProduct> & { id: string; name: string }): RawProduct {
  return {
    description: null,
    price: null,
    image: null,
    isActive: true,
    dealerId: 'd1',
    categoryId: 'c1',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    category: { id: 'c1', name: 'Kahveler', icon: '☕', isActive: true },
    ...over,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('İstanbul zamanı', () => {
  it('gün ve hafta başlangıcı UTC+3', () => {
    expect(istanbulDayStart(new Date('2026-10-10T22:30:00Z')).toISOString()).toBe('2026-10-10T21:00:00.000Z');
    expect(istanbulWeekStart(NOW).toISOString()).toBe('2026-10-04T21:00:00.000Z'); // Pzt 5 Eki 00:00 İst
  });
  it('30 günlük pencere bugünü kapsar', () => {
    const { curStart, prevStart } = statsWindows(NOW);
    expect(curStart.toISOString()).toBe('2026-09-11T21:00:00.000Z');
    expect(prevStart.toISOString()).toBe('2026-08-12T21:00:00.000Z');
  });
});

describe('istatistik ve içgörüler', () => {
  const stats = computeProductStats(
    { cur: [{ productId: 'p1', count: 10 }, { productId: 'p2', count: 2 }], prev: [{ productId: 'p1', count: 5 }] },
    [
      { productId: 'p1', rating: 5, createdAt: new Date('2026-10-01T10:00:00Z') },
      { productId: 'p1', rating: 4, createdAt: new Date('2026-10-02T10:00:00Z') },
      { productId: 'p2', rating: 1, createdAt: new Date('2026-10-02T10:00:00Z') },
      { productId: 'p2', rating: 2, createdAt: new Date('2026-10-03T10:00:00Z') },
      { productId: 'p2', rating: 3, createdAt: new Date('2026-10-04T10:00:00Z') },
      { productId: 'p2', rating: 5, createdAt: new Date('2026-08-01T10:00:00Z') }, // pencere dışı
      { productId: 'p2', rating: 9, createdAt: new Date('2026-10-04T10:00:00Z') }, // geçersiz
    ],
    NOW
  );
  it('ürün başına sayılar ve ortalama', () => {
    expect(stats.get('p1')).toEqual({ consumptions30: 10, consumptionsPrev30: 5, reviews30: 2, avgRating30: 4.5, low30: 0 });
    expect(stats.get('p2')).toEqual({ consumptions30: 2, consumptionsPrev30: 0, reviews30: 3, avgRating30: 2, low30: 2 });
  });
  it('içgörüler: en çok tüketilen, en düşük puanlı (≥3 değerlendirme), fiyatsız', () => {
    const all = [
      toProductDto(raw({ id: 'p1', name: 'Latte', price: 90 }), 'd1', stats.get('p1'), true),
      toProductDto(raw({ id: 'p2', name: 'Mocha' }), 'd1', stats.get('p2'), true),
      toProductDto(raw({ id: 'p3', name: 'Eski', isActive: false }), 'd1', undefined, true),
    ];
    const i = buildInsights(all);
    expect(i.topConsumed).toEqual({ id: 'p1', name: 'Latte', count: 10 });
    expect(i.lowestRated).toEqual({ id: 'p2', name: 'Mocha', avg: 2, reviews: 3 });
    expect(i.missingPrice).toBe(1);
    expect(i.activeCount).toBe(2);
    expect(i.archivedCount).toBe(1);
  });
  it('haftalık seri 8 kova, eskiden yeniye', () => {
    const w = weeklySeries([{ createdAt: new Date('2026-10-06T10:00:00Z'), rating: 4 }], NOW);
    expect(w).toHaveLength(8);
    expect(w[7]).toEqual({ weekStart: '2026-10-05', consumptions: 1, avgRating: 4 });
  });
});

describe('liste: arama, filtre, sıralama, sayfa', () => {
  const items = [
    toProductDto(raw({ id: 'a', name: 'İskender', price: 250 }), 'd1', undefined, true),
    toProductDto(raw({ id: 'b', name: 'Şiş kebap', price: null }), 'd1', undefined, true),
    toProductDto(raw({ id: 'c', name: 'Ayran', price: 0, description: 'Yayık' }), 'd1', undefined, true),
    toProductDto(raw({ id: 'g', name: 'Su', dealerId: null }), 'd1', undefined, true),
  ];
  const q = (s: string) => parseCatalogQuery(new URLSearchParams(s));
  it('Türkçe duyarlı arama (Bulgu 4) ve global arama derin bağlantısı', () => {
    expect(matchesSearch(['İskender'], 'iskender')).toBe(true);
    expect(matchesSearch(['IRMIK'], 'ırmık')).toBe(true);
    expect(selectCatalogPage(items, q('search=sis')).items.map((p) => p.id)).toEqual(['b']);
    expect(selectCatalogPage(items, q('q=yayik')).items.map((p) => p.id)).toEqual(['c']);
  });
  it('fiyat sıralamasında fiyatsız en sonda; fiyatsız filtresi', () => {
    expect(selectCatalogPage(items, q('sort=price.desc')).items.map((p) => p.id)).toEqual(['a', 'c', 'g', 'b']);
    expect(selectCatalogPage(items, q('missing=price')).items.map((p) => p.id)).toEqual(['g', 'b']);
  });
  it('sayfa taşarsa son sayfaya sıkışır', () => {
    const r = selectCatalogPage(items, { ...q('size=12'), page: 9 });
    expect(r.page).toBe(1);
    expect(r.total).toBe(4);
  });
  it('sistem ürünü düzenlenemez; salt-okunur görünümde hiçbiri', () => {
    expect(items.find((p) => p.id === 'g')).toMatchObject({ isGlobal: true, canEdit: false });
    expect(toProductDto(raw({ id: 'x', name: 'X' }), 'd1', undefined, false).canEdit).toBe(false);
  });
  it('sorgu anahtarı ve arama dizgisi gidiş-dönüş', () => {
    const a = q('q=kahve&category=c1&status=archived&sort=rating.asc&page=2&size=48&missing=price');
    expect(parseCatalogQuery(new URLSearchParams(catalogSearchString(a).slice(1)))).toEqual(a);
    expect(catalogQueryKey(a)).toEqual(catalogQueryKey(parseCatalogQuery(new URLSearchParams(catalogSearchString(a).slice(1)))));
    expect(q('sort=evil.asc&size=7&category=../x')).toMatchObject({ sort: 'name', pageSize: 24, category: null });
  });
});

describe('para ve CSV', () => {
  it('kuruş dönüşümü kayan nokta hatasız', () => {
    expect(priceToMinor(19.99)).toBe(1999);
    expect(minorToPrice(1999)).toBe(19.99);
    expect(parsePriceToMinor('1.234,50 ₺')).toEqual({ ok: true, minor: 123450 });
    expect(parsePriceToMinor('45,555')).toEqual({ ok: false, reason: 'precision' });
    expect(adjustMinorByPercent(4550, 10, 50)).toBe(5000);
  });
  it('CSV gidiş-dönüş ve formül enjeksiyonu kaçışı', () => {
    const text = toCsv([['Ürün adı', 'Kategori'], ['=HYPERLINK()', 'A;B']]);
    expect(parseCsv(text)).toEqual([
      ['Ürün adı', 'Kategori'],
      ["'=HYPERLINK()", 'A;B'],
    ]);
  });
  it('içe aktarma raporu: yeni/yinelenen/hatalı satırlar ve yeni kategori', () => {
    const csv = 'Ürün adı;Kategori;Fiyat\nLatte;Kahveler;90\nMocha;Tatlı Kahve;abc\nlatte;Kahveler;10\nEspresso;Yeni;45,5\nLatte Mevcut;Kahveler;';
    const r = buildImportReport(csv, { categories: [{ id: 'c1', name: 'kahveler' }], products: [{ id: 'p9', name: 'LATTE MEVCUT' }] }, 'skip');
    expect(r.fileError).toBeNull();
    expect(r.rows.map((x) => x.status)).toEqual(['create', 'error', 'error', 'create', 'skip']);
    expect(r.rows[3]).toMatchObject({ newCategory: true, priceMinor: 4550 });
    expect(r.summary.newCategories).toEqual(['Yeni']);
    const u = buildImportReport(csv, { categories: [], products: [{ id: 'p9', name: 'Latte mevcut' }] }, 'update');
    expect(u.rows[4]).toMatchObject({ status: 'update', productId: 'p9' });
  });
  it('başlık eksikse dosya hatası', () => {
    expect(buildImportReport('Fiyat\n10', { categories: [], products: [] }, 'skip').fileError).toMatch(/Ürün adı/);
  });
});

describe('görsel alanı', () => {
  it('yalnız bu bayinin products/ alanı kabul edilir', () => {
    const base = 'https://cdn.example.com';
    const key = productImageKey('d1', 'a'.repeat(24), NOW);
    expect(key).toBe(`products/d1/2026-10/${'a'.repeat(24)}.jpg`);
    expect(isAcceptedProductImage(`${base}/${key}`, 'd1', base)).toBe(true);
    expect(isAcceptedProductImage(`${base}/${key}`, 'd2', base)).toBe(false);
    expect(isAcceptedProductImage('https://evil.com/x.jpg', 'd1', base)).toBe(false);
    expect(isAcceptedProductImage(`${base}/${key}`, 'd1', null)).toBe(false);
  });
});

describe('şemalar', () => {
  it('güncelleme yalnız sürümle gelirse reddedilir; bilinmeyen alan reddedilir', () => {
    expect(productUpdateSchema.safeParse({ baseUpdatedAt: NOW.toISOString() }).success).toBe(false);
    expect(productUpdateSchema.safeParse({ dealerId: 'x' }).success).toBe(false);
    expect(productUpdateSchema.safeParse({ priceMinor: 12.5 }).success).toBe(false);
  });
  it('toplu: taşıma hedefsiz, fiyat yüzdesiz reddedilir', () => {
    expect(productBulkSchema.safeParse({ ids: ['a'], action: 'move' }).success).toBe(false);
    expect(productBulkSchema.safeParse({ ids: ['a'], action: 'adjustPrice' }).success).toBe(false);
    expect(productBulkSchema.safeParse({ ids: ['a', 'a'], action: 'archive' }).success).toBe(false);
  });
});

describe('yazma kuralları', () => {
  it('aynı adla aktif ürün varsa 409', async () => {
    db.productCategory.findUnique.mockResolvedValue({ id: 'c1', dealerId: 'd1', isActive: true });
    db.product.findMany.mockResolvedValue([{ id: 'p1', name: 'latte ' }]);
    await expect(
      createProduct('d1', { name: 'Latte', categoryId: 'c1', description: null, priceMinor: 9000, image: null })
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(db.product.create).not.toHaveBeenCalled();
  });
  it('fiyat kuruştan yazılır; harici görsel reddedilir', async () => {
    db.productCategory.findUnique.mockResolvedValue({ id: 'c1', dealerId: null, isActive: true });
    db.product.findMany.mockResolvedValue([]);
    db.product.create.mockResolvedValue(raw({ id: 'n', name: 'Latte', price: 90.5 }));
    const dto = await createProduct('d1', { name: 'Latte', categoryId: 'c1', description: null, priceMinor: 9050, image: null });
    expect(db.product.create.mock.calls[0][0].data).toMatchObject({ price: 90.5, dealerId: 'd1' });
    expect(dto.priceMinor).toBe(9050);
    await expect(
      createProduct('d1', { name: 'B', categoryId: 'c1', description: null, priceMinor: null, image: 'https://evil.com/a.jpg' })
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  it('başka bayinin ürünü 404, sistem ürünü 403, eski sürüm 409', async () => {
    db.product.findUnique.mockResolvedValueOnce({ id: 'p', dealerId: 'd2' });
    await expect(updateProduct('d1', 'p', { name: 'X' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    db.product.findUnique.mockResolvedValueOnce({ id: 'p', dealerId: null });
    await expect(updateProduct('d1', 'p', { name: 'X' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    db.product.findUnique.mockResolvedValueOnce({
      id: 'p', dealerId: 'd1', name: 'A', image: null, isActive: true, categoryId: 'c1',
      updatedAt: new Date('2026-10-10T00:00:00Z'), category: { isActive: true },
    });
    await expect(updateProduct('d1', 'p', { name: 'B', baseUpdatedAt: '2026-10-09T00:00:00.000Z' })).rejects.toMatchObject({ status: 409 });
  });
  it('kategorisi arşivdeki ürün geri yüklenemez', async () => {
    db.product.findUnique.mockResolvedValueOnce({
      id: 'p', dealerId: 'd1', name: 'A', image: null, isActive: false, categoryId: 'c1',
      updatedAt: NOW, category: { isActive: false },
    });
    db.product.findMany.mockResolvedValue([]);
    await expect(updateProduct('d1', 'p', { isActive: true })).rejects.toMatchObject({ status: 409 });
  });
  it('içinde aktif ürün olan kategori hedefsiz arşivlenemez (cascade/yetim yok)', async () => {
    db.productCategory.findUnique.mockResolvedValue({ id: 'c1', dealerId: 'd1', name: 'K', isActive: true });
    db.product.count.mockResolvedValue(3);
    await expect(archiveCategory('d1', 'c1', null)).rejects.toMatchObject({ status: 409 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('toplu fiyat: yalnız bayinin fiyatlı ürünleri, kuruşta', async () => {
    db.product.findMany.mockResolvedValueOnce([
      { id: 'a', name: 'A', price: 45.5, isActive: true, category: { isActive: true } },
      { id: 'b', name: 'B', price: null, isActive: true, category: { isActive: true } },
    ]);
    db.product.update.mockImplementation((args: unknown) => args);
    db.$transaction.mockResolvedValue([]);
    const r = await bulkProducts('d1', { ids: ['a', 'b', 'z'], action: 'adjustPrice', percent: 10, roundTo: 50 });
    expect(r.updated).toBe(1);
    expect(r.skipped).toBe(2);
    expect(db.product.update.mock.calls[0][0]).toMatchObject({ where: { id: 'a' }, data: { price: 50 } });
  });
});
