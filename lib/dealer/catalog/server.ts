/**
 * Ürün kataloğu — sunucu okuma katmanı (Prisma). SSR sayfası ve BFF GET'i AYNI fonksiyonu
 * çağırır. Kiracı kapsamı çağırandan gelir (`resolveDealerScope` / `defineRoute tenant`).
 *
 * Katalog küçük (bayi başına yüzler): bayinin + sistemin ürünleri tek sorguda okunur
 * (üst sınır `CATALOG_LOAD_CAP`, aşılırsa `capped: true` ile dürüstçe bildirilir), istatistik
 * iki `groupBy` + bir değerlendirme sorgusuyla hesaplanır (N+1 yok). Türkçe duyarlı arama ve
 * istatistiğe göre sıralama Postgres'te yapılamadığı için filtre/sıralama/sayfa bellekte.
 */
import 'server-only';
import { prisma } from '@/lib/prisma';
import { feedbackPhotosEnabled } from '@/lib/feedback-funnel/media';
import {
  buildCategoryDtos,
  buildInsights,
  computeProductStats,
  istanbulWeekStart,
  selectCatalogPage,
  statsWindows,
  toProductDto,
  weeklySeries,
  DAY_MS,
  type RawCategory,
  type RawProduct,
} from './core';
import type { CatalogQuery } from './schemas';
import type { CatalogPageDto, CatalogProductDto, ProductDetailDto } from './types';

export const CATALOG_LOAD_CAP = 2000;
const REVIEW_SCAN_CAP = 20_000;

/** Bayinin görebildiği kayıtlar: kendi + sistem (global). */
export function visibleToDealer(dealerId: string) {
  return { OR: [{ dealerId }, { dealerId: null }] };
}

const PRODUCT_SELECT = {
  id: true,
  name: true,
  description: true,
  price: true,
  image: true,
  isActive: true,
  dealerId: true,
  categoryId: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, icon: true, isActive: true } },
} as const;

async function loadRaw(dealerId: string) {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      // Sistem ürünlerinden yalnız aktifler; bayinin arşivi de gelir (Arşiv sekmesi).
      where: { OR: [{ dealerId }, { dealerId: null, isActive: true }] },
      select: PRODUCT_SELECT,
      orderBy: { name: 'asc' },
      take: CATALOG_LOAD_CAP + 1,
    }),
    prisma.productCategory.findMany({
      where: { OR: [{ dealerId }, { dealerId: null, isActive: true }] },
      select: { id: true, name: true, icon: true, order: true, dealerId: true, isActive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      take: 500,
    }),
  ]);
  const capped = products.length > CATALOG_LOAD_CAP;
  return { products: (capped ? products.slice(0, CATALOG_LOAD_CAP) : products) as RawProduct[], categories: categories as RawCategory[], capped };
}

async function loadStats(dealerId: string, now: Date) {
  const { curStart, prevStart } = statsWindows(now);
  const [cur, prev, reviews] = await Promise.all([
    prisma.consumption.groupBy({
      by: ['productId'],
      where: { dealerId, productId: { not: null }, createdAt: { gte: curStart } },
      _count: { _all: true },
    }),
    prisma.consumption.groupBy({
      by: ['productId'],
      where: { dealerId, productId: { not: null }, createdAt: { gte: prevStart, lt: curStart } },
      _count: { _all: true },
    }),
    prisma.consumptionReview.findMany({
      where: { deletedAt: null, consumption: { dealerId, productId: { not: null }, createdAt: { gte: curStart } } },
      select: { rating: true, consumption: { select: { productId: true, createdAt: true } } },
      take: REVIEW_SCAN_CAP,
    }),
  ]);
  return computeProductStats(
    {
      cur: cur.map((r) => ({ productId: r.productId, count: r._count._all })),
      prev: prev.map((r) => ({ productId: r.productId, count: r._count._all })),
    },
    reviews.map((r) => ({ productId: r.consumption.productId, rating: r.rating, createdAt: r.consumption.createdAt })),
    now
  );
}

export async function loadCatalogPage(
  dealerId: string,
  query: CatalogQuery,
  opts: { canWrite: boolean; now?: Date } = { canWrite: true }
): Promise<CatalogPageDto> {
  const now = opts.now ?? new Date();
  const [raw, stats] = await Promise.all([loadRaw(dealerId), loadStats(dealerId, now)]);
  const all: CatalogProductDto[] = raw.products.map((p) => toProductDto(p, dealerId, stats.get(p.id), opts.canWrite));
  const categories = buildCategoryDtos(raw.categories, raw.products, dealerId, opts.canWrite);
  const page = selectCatalogPage(all, query);
  return {
    items: page.items,
    total: page.total,
    page: page.page,
    pageSize: query.pageSize,
    capped: raw.capped,
    categories,
    insights: buildInsights(all),
    imageUploadEnabled: opts.canWrite && feedbackPhotosEnabled(),
    canWrite: opts.canWrite,
    generatedAt: now.toISOString(),
  };
}

export async function loadProductDetail(
  dealerId: string,
  productId: string,
  opts: { canWrite: boolean; now?: Date } = { canWrite: true }
): Promise<ProductDetailDto | null> {
  const now = opts.now ?? new Date();
  const product = await prisma.product.findFirst({
    where: { id: productId, OR: [{ dealerId }, { dealerId: null }] },
    select: PRODUCT_SELECT,
  });
  if (!product) return null;
  const weeksStart = new Date(istanbulWeekStart(now).getTime() - 7 * 7 * DAY_MS);
  const { curStart } = statsWindows(now);
  const since = weeksStart < curStart ? weeksStart : curStart;

  const [rows, allTime, recent, stats] = await Promise.all([
    prisma.consumption.findMany({
      where: { dealerId, productId, createdAt: { gte: since } },
      select: { createdAt: true, review: { select: { rating: true, deletedAt: true } } },
      take: 20_000,
    }),
    prisma.consumption.count({ where: { dealerId, productId } }),
    prisma.consumptionReview.findMany({
      where: { deletedAt: null, consumption: { dealerId, productId } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, rating: true, text: true, createdAt: true, dealerReply: true },
    }),
    loadStats(dealerId, now),
  ]);

  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const series = rows.map((r) => {
    const rating = r.review && !r.review.deletedAt ? r.review.rating : null;
    if (rating !== null && r.createdAt >= curStart && rating >= 1 && rating <= 5) distribution[rating - 1] += 1;
    return { createdAt: r.createdAt, rating };
  });

  return {
    product: toProductDto(product as RawProduct, dealerId, stats.get(product.id), opts.canWrite),
    distribution,
    weekly: weeklySeries(series, now),
    recentReviews: recent.map((r) => ({
      id: r.id,
      rating: r.rating,
      text: r.text,
      createdAt: r.createdAt.toISOString(),
      replied: !!r.dealerReply,
    })),
    consumptionsAllTime: allTime,
  };
}
