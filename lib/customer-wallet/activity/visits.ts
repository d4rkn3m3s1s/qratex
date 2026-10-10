/**
 * Ziyaretler (Cüzdan → Hareketler → Ziyaretler) — sunucu servisi.
 *
 * Denetim bulguları (docs/audit/2026-10-08/musteri/customer_consumptions.md):
 *  - B1: özet sayılar FİLTREDEN BAĞIMSIZ (negatif "Yorumlandı" imkânsız).
 *  - B2: imleç sayfalaması + sunucu tarafı arama (İ/ı: Postgres ILIKE, istemci küçültmesi yok).
 *  - B7: bekleyen yorumların ödülü ve bugünkü tavan durumu SUNUCUDAN (puan matrisi + tavan).
 *  - B8: açık `select`, `any` yok; kullanılmayan alan taşınmaz.
 */
import type { Prisma } from '@prisma/client';
import type { prisma as prismaClient } from '@/lib/prisma';
import { ECONOMY_CAPS, sumEarnedInWindow } from '@/lib/economy/caps';
import { getConsumptionReviewReward, getPointsMatrix } from '@/lib/points-rules';

type Db = Pick<typeof prismaClient, 'consumption' | 'analyticsEvent' | 'settings'>;

export type ReviewFilter = 'all' | 'pending' | 'reviewed';

export type VisitItem = {
  id: string;
  at: string;
  dealer: { id: string; name: string | null; logo: string | null };
  product: { name: string; categoryName: string | null; categoryIcon: string | null } | null;
  /** Yalnız gerçek, pozitif tutar (0/negatif/NaN gösterilmez — B11). */
  amount: number | null;
  review:
    | { state: 'pending' }
    | { state: 'reviewed'; rating: number; excerpt: string | null; dealerReplied: boolean; repliedAt: string | null }
    | { state: 'removed' };
};

export type VisitStats = { total: number; pending: number; reviewed: number; replied: number };

export type ReviewRewardPreview = {
  base: number;
  detailed: number;
  /** Detaylı ödül için gereken en az karakter. */
  detailedMinChars: number;
  /** Bugün/bu hafta yorumdan kalan puan hakkı (null = tavan yok). */
  remainingToday: number | null;
  dailyCap: number | null;
};

export type VisitsPage = {
  items: VisitItem[];
  nextCursor: string | null;
};

export const VISITS_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const EXCERPT_LEN = 140;

const VISIT_SELECT = {
  id: true,
  createdAt: true,
  amount: true,
  dealer: { select: { id: true, businessName: true, name: true, businessLogo: true } },
  product: { select: { name: true, category: { select: { name: true, icon: true } } } },
  review: { select: { rating: true, text: true, dealerReply: true, dealerRepliedAt: true, deletedAt: true } },
} satisfies Prisma.ConsumptionSelect;

type VisitRow = Prisma.ConsumptionGetPayload<{ select: typeof VISIT_SELECT }>;

export function validAmount(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1_000_000 ? v : null;
}

function toVisit(row: VisitRow): VisitItem {
  const r = row.review;
  let review: VisitItem['review'];
  if (!r) review = { state: 'pending' };
  else if (r.deletedAt) review = { state: 'removed' };
  else {
    const text = (r.text ?? '').trim();
    review = {
      state: 'reviewed',
      rating: Math.max(1, Math.min(5, Math.round(r.rating))),
      excerpt: text ? (text.length > EXCERPT_LEN ? `${text.slice(0, EXCERPT_LEN - 1)}…` : text) : null,
      dealerReplied: !!(r.dealerReply && r.dealerReply.trim()),
      repliedAt: r.dealerRepliedAt ? r.dealerRepliedAt.toISOString() : null,
    };
  }
  const dealerName = row.dealer?.businessName?.trim() || row.dealer?.name?.trim() || null;
  return {
    id: row.id,
    at: row.createdAt.toISOString(),
    dealer: { id: row.dealer?.id ?? '', name: dealerName, logo: row.dealer?.businessLogo || null },
    product: row.product
      ? { name: row.product.name, categoryName: row.product.category?.name ?? null, categoryIcon: row.product.category?.icon ?? null }
      : null,
    amount: validAmount(row.amount),
    review,
  };
}

export type VisitsQuery = {
  cursor?: string | null;
  review?: ReviewFilter;
  q?: string | null;
  dealerId?: string | null;
  limit?: number;
};

/**
 * Türkçe İ/ı varyantları (denetim B5): ILIKE büyük/küçük harfi katlar ama noktalı/noktasız
 * i çiftini veritabanı yerel ayarına bağlı katlar. "ırmak" ↔ "IRMAK", "ist" ↔ "İstanbul"
 * eşleşsin diye sorgu, i/ı ve I/İ birbirine çevrilmiş biçimleriyle de aranır.
 */
export function turkishSearchVariants(q: string): string[] {
  const dotless = q.replace(/ı/g, 'i').replace(/İ/g, 'I');
  const dotted = q.replace(/i/g, 'ı').replace(/I/g, 'İ');
  const upperDotted = q.replace(/i/g, 'İ');
  return [...new Set([q, dotless, dotted, upperDotted])];
}

export function buildVisitsWhere(userId: string, query: Pick<VisitsQuery, 'review' | 'q' | 'dealerId'>): Prisma.ConsumptionWhereInput {
  const where: Prisma.ConsumptionWhereInput = { customerId: userId };
  if (query.review === 'pending') where.review = null;
  if (query.review === 'reviewed') where.review = { isNot: null };
  if (query.dealerId) where.dealerId = query.dealerId;
  const q = query.q?.trim();
  if (q) {
    where.OR = turkishSearchVariants(q).flatMap((v) => [
      { dealer: { businessName: { contains: v, mode: 'insensitive' as const } } },
      { dealer: { name: { contains: v, mode: 'insensitive' as const } } },
      { product: { name: { contains: v, mode: 'insensitive' as const } } },
    ]);
  }
  return where;
}

export async function getVisitsPage(db: Db, userId: string, query: VisitsQuery = {}): Promise<VisitsPage> {
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(query.limit ?? VISITS_PAGE_SIZE)));
  const cursorId = query.cursor && /^[A-Za-z0-9_-]{1,64}$/.test(query.cursor) ? query.cursor : null;
  const rows = await db.consumption.findMany({
    where: buildVisitsWhere(userId, query),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: VISIT_SELECT,
  });
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { items: page.map(toVisit), nextCursor: rows.length > limit && last ? last.id : null };
}

/** Filtreden BAĞIMSIZ özet (B1). */
export async function getVisitStats(db: Db, userId: string): Promise<VisitStats> {
  const [total, pending, reviewed, replied] = await Promise.all([
    db.consumption.count({ where: { customerId: userId } }),
    db.consumption.count({ where: { customerId: userId, review: null } }),
    db.consumption.count({ where: { customerId: userId, review: { is: { deletedAt: null } } } }),
    db.consumption.count({ where: { customerId: userId, review: { is: { deletedAt: null, dealerReply: { not: null } } } } }),
  ]);
  return { total, pending, reviewed, replied };
}

/** Yorum bekleyen en yeni ziyaretler (puan rafı). */
export async function getPendingShelf(db: Db, userId: string, take = 8): Promise<VisitItem[]> {
  const rows = await db.consumption.findMany({
    where: { customerId: userId, review: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: VISIT_SELECT,
  });
  return rows.map(toVisit);
}

/**
 * Yorum ödülü önizlemesi — puan matrisi + geri bildirim kovasının bugünkü kalan hakkı.
 * Sunucu otoriter: istemci bu sayıları hesaplamaz; vaat edilen puan tavanı aşamaz.
 */
export async function getReviewRewardPreview(db: Db, userId: string, now: Date = new Date()): Promise<ReviewRewardPreview> {
  const matrix = await getPointsMatrix(db as unknown as Parameters<typeof getPointsMatrix>[0]);
  const detailedMinChars = matrix.consumptionReview.longTextThreshold;
  // Yorum yolunun kendi kuralı (getConsumptionReviewReward) — boş metin taban, eşik kadar metin detaylı.
  const base = getConsumptionReviewReward('', matrix);
  const detailed = getConsumptionReviewReward('x'.repeat(Math.max(1, detailedMinChars)), matrix);
  const rule = ECONOMY_CAPS.feedback;
  const earned = await sumEarnedInWindow(db as unknown as Parameters<typeof sumEarnedInWindow>[0], { userId, rule, now });
  const remaining = Math.max(0, Math.min(rule.daily - earned.today, rule.weekly - earned.week));
  return {
    base: base.points,
    detailed: detailed.points,
    detailedMinChars,
    remainingToday: remaining,
    dailyCap: rule.daily,
  };
}
