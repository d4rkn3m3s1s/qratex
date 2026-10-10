/**
 * Kiracı kapsamlı müşteri istatistiği (P0-12 — acil kısım + kalıcı `DealerCustomerStats`).
 *
 * Kök neden: `CustomerLifetimeValue.userId @unique` platform GENELİ tek satırdı ve `clv-core`
 * harcamayı `dealerId` olmadan topluyordu. Bayi (ve personeli) `/api/dealer/customers` ile
 * müşterinin RAKİP işletmelerdeki harcamasını, ziyaretlerini, son alışveriş tarihini, global
 * segmentini ve platform güven skorunu görüyordu.
 *
 * Bu modülün sözleşmesi:
 *  - Her metrik YALNIZ verilen bayinin verisinden hesaplanır: `Consumption.dealerId`,
 *    `Feedback.qrCode.dealerId`, `ConsumptionReview.consumption.dealerId`.
 *  - Kalıcı katman: `DealerCustomerStats @@unique([dealerId, customerId])` (cron ile yenilenir,
 *    `recomputeAllDealerCustomerStats`). Satır yoksa (cron henüz koşmadı) bayi uçları canlı,
 *    bayi kapsamlı hesaplamaya düşer (`computeDealerCustomerStats`).
 *  - Global CLV yalnız admin içgörüleri için kalır; bayi uçları onu OKUMAZ.
 */
import { prisma } from '@/lib/prisma';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bayi-yerel segment anahtarları (platform segment tablosundan bağımsız). */
export type DealerSegmentKey = 'at_risk' | 'vip' | 'loyal' | 'dormant' | 'new';

/** `lib/segment-action-center` adlarıyla eşleme (UI ve aksiyon önerileri bu adları bekler). */
export const DEALER_SEGMENT_NAME: Readonly<Record<DealerSegmentKey, string>> = {
  at_risk: 'Risk Altında',
  vip: 'VIP',
  loyal: 'Sadık',
  dormant: 'Uyuyan',
  new: 'Yeni',
};

export const DEALER_SEGMENT_COLOR: Readonly<Record<DealerSegmentKey, string>> = {
  at_risk: '#FF6B6B',
  vip: '#FFD700',
  loyal: '#45B7D1',
  dormant: '#95A5A6',
  new: '#4ECDC4',
};

export interface DealerCustomerStat {
  dealerId: string;
  customerId: string;
  totalSpend: number;
  visitCount: number;
  avgOrderValue: number;
  reviewCount: number;
  avgRating: number | null;
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
  /** 0-1, yalnız bu bayideki AI sinyallerinden. */
  churnRisk: number | null;
  segmentKey: DealerSegmentKey | null;
}

/** Bayi-yerel segment kuralı (öncelik: Risk > VIP > Sadık > Uyuyan > Yeni) — saf fonksiyon. */
export function pickDealerSegment(
  m: Pick<DealerCustomerStat, 'totalSpend' | 'visitCount' | 'churnRisk' | 'firstVisitAt' | 'lastVisitAt'>,
  now: Date
): DealerSegmentKey | null {
  if (m.churnRisk != null && m.churnRisk >= 0.5) return 'at_risk';
  if (m.totalSpend >= 5000) return 'vip';
  if (m.visitCount >= 10) return 'loyal';
  if (m.lastVisitAt && now.getTime() - m.lastVisitAt.getTime() >= 30 * DAY_MS) return 'dormant';
  if (m.firstVisitAt && now.getTime() - m.firstVisitAt.getTime() <= 30 * DAY_MS) return 'new';
  return null;
}

/** 0-1 kayıp olasılığını kaba kovaya çevirir (UI rozeti). */
export function churnBucketOf(churn: number | null): 'HIGH' | 'MEDIUM' | 'LOW' | null {
  if (churn == null) return null;
  if (churn >= 0.5) return 'HIGH';
  if (churn >= 0.3) return 'MEDIUM';
  return 'LOW';
}

type SpendRow = {
  customerId: string;
  _sum: { amount: number | null };
  _count: { _all: number };
  _avg: { amount: number | null };
  _min: { createdAt: Date | null };
  _max: { createdAt: Date | null };
};
type SignalRow = { userId: string | null; avg: number | null; n: number };
type RatingRow = { userId: string | null; avg: number | null; n: number };

/**
 * Ham toplulaştırmalardan istatistik satırlarını kurar — SAF (test edilebilir).
 * Yalnız `spend` listesindeki (bu bayide tüketimi olan) müşteriler için satır üretir.
 */
export function buildDealerCustomerStats(
  dealerId: string,
  spend: ReadonlyArray<SpendRow>,
  churnSignals: ReadonlyArray<SignalRow>,
  ratings: ReadonlyArray<RatingRow>,
  now: Date
): DealerCustomerStat[] {
  const churnAcc = new Map<string, { sum: number; n: number }>();
  for (const s of churnSignals) {
    if (!s.userId || s.avg == null || s.n <= 0) continue;
    const cur = churnAcc.get(s.userId) ?? { sum: 0, n: 0 };
    cur.sum += s.avg * s.n;
    cur.n += s.n;
    churnAcc.set(s.userId, cur);
  }
  const ratingAcc = new Map<string, { sum: number; n: number }>();
  for (const r of ratings) {
    if (!r.userId || r.n <= 0) continue;
    const cur = ratingAcc.get(r.userId) ?? { sum: 0, n: 0 };
    if (r.avg != null) cur.sum += r.avg * r.n;
    cur.n += r.n;
    ratingAcc.set(r.userId, cur);
  }

  return spend.map((row) => {
    const totalSpend = round2(row._sum.amount ?? 0);
    const visitCount = row._count._all ?? 0;
    const avgOrderValue = round2(row._avg.amount ?? 0);
    const churn = churnAcc.get(row.customerId);
    const churnRisk = churn && churn.n > 0 ? clamp01(churn.sum / churn.n) : null;
    const rating = ratingAcc.get(row.customerId);
    const base = {
      dealerId,
      customerId: row.customerId,
      totalSpend,
      visitCount,
      avgOrderValue,
      reviewCount: rating?.n ?? 0,
      avgRating: rating && rating.n > 0 ? Math.round((rating.sum / rating.n) * 100) / 100 : null,
      firstVisitAt: row._min.createdAt ?? null,
      lastVisitAt: row._max.createdAt ?? null,
      churnRisk,
    };
    return { ...base, segmentKey: pickDealerSegment(base, now) };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Bir bayinin müşteri istatistiklerini CANLI ve YALNIZ bu bayinin verisinden hesaplar.
 * `customerIds` verilirse yalnız o müşteriler.
 */
export async function computeDealerCustomerStats(
  dealerId: string,
  options: { now?: Date; customerIds?: string[] } = {}
): Promise<DealerCustomerStat[]> {
  const now = options.now ?? new Date();
  const customerFilter = options.customerIds ? { in: options.customerIds } : undefined;

  const [spend, fbChurn, crChurn, fbRating, crRating] = await Promise.all([
    prisma.consumption.groupBy({
      by: ['customerId'],
      where: { dealerId, ...(customerFilter ? { customerId: customerFilter } : {}) },
      _sum: { amount: true },
      _count: { _all: true },
      _avg: { amount: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
    prisma.feedback.groupBy({
      by: ['userId'],
      where: {
        qrCode: { dealerId },
        deletedAt: null,
        churnRisk: { not: null },
        ...(customerFilter ? { userId: customerFilter } : { userId: { not: null } }),
      },
      _avg: { churnRisk: true },
      _count: { churnRisk: true },
    }),
    prisma.consumptionReview.groupBy({
      by: ['customerId'],
      where: {
        consumption: { dealerId },
        deletedAt: null,
        churnRisk: { not: null },
        ...(customerFilter ? { customerId: customerFilter } : {}),
      },
      _avg: { churnRisk: true },
      _count: { churnRisk: true },
    }),
    prisma.feedback.groupBy({
      by: ['userId'],
      where: {
        qrCode: { dealerId },
        deletedAt: null,
        ...(customerFilter ? { userId: customerFilter } : { userId: { not: null } }),
      },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.consumptionReview.groupBy({
      by: ['customerId'],
      where: {
        consumption: { dealerId },
        deletedAt: null,
        ...(customerFilter ? { customerId: customerFilter } : {}),
      },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  return buildDealerCustomerStats(
    dealerId,
    spend as unknown as SpendRow[],
    [
      ...fbChurn.map((r) => ({ userId: r.userId, avg: r._avg.churnRisk, n: r._count.churnRisk })),
      ...crChurn.map((r) => ({ userId: r.customerId, avg: r._avg.churnRisk, n: r._count.churnRisk })),
    ],
    [
      ...fbRating.map((r) => ({ userId: r.userId, avg: r._avg.rating, n: r._count._all })),
      ...crRating.map((r) => ({ userId: r.customerId, avg: r._avg.rating, n: r._count._all })),
    ],
    now
  );
}

function toRowData(stat: DealerCustomerStat, now: Date) {
  return {
    totalSpend: stat.totalSpend,
    visitCount: stat.visitCount,
    avgOrderValue: stat.avgOrderValue,
    reviewCount: stat.reviewCount,
    avgRating: stat.avgRating,
    firstVisitAt: stat.firstVisitAt,
    lastVisitAt: stat.lastVisitAt,
    churnRisk: stat.churnRisk,
    segmentKey: stat.segmentKey,
    calculatedAt: now,
  };
}

/** Tek transaction'da yazılan upsert sayısı (satır-satır gidiş-dönüşü azaltır, tx'i kısa tutar). */
const UPSERT_CHUNK = 200;

/**
 * Bir bayinin istatistiklerini hesaplayıp `DealerCustomerStats`'a yazar (idempotent upsert).
 * Bu turda yazılmayan (artık bu bayide tüketimi olmayan — silinmiş/anonimleştirilmiş tüketim)
 * eski satırlar SİLİNİR; bayi bayat bir müşteri satırı görmeye devam etmez.
 */
export async function recomputeDealerCustomerStats(dealerId: string, now: Date = new Date()): Promise<number> {
  const stats = await computeDealerCustomerStats(dealerId, { now });
  for (let i = 0; i < stats.length; i += UPSERT_CHUNK) {
    const chunk = stats.slice(i, i + UPSERT_CHUNK);
    await prisma.$transaction(
      chunk.map((stat) => {
        const data = toRowData(stat, now);
        return prisma.dealerCustomerStats.upsert({
          where: { dealerId_customerId: { dealerId, customerId: stat.customerId } },
          update: data,
          create: { dealerId, customerId: stat.customerId, ...data },
        });
      })
    );
  }
  // Yalnız bütün upsert'ler başarılıysa buraya gelinir: bu turda dokunulmayan satırlar bayattır.
  await prisma.dealerCustomerStats.deleteMany({ where: { dealerId, calculatedAt: { lt: now } } });
  return stats.length;
}

/**
 * Tüketimi olan BÜTÜN bayiler için yeniden hesaplar (günlük CLV cron'una bağlı — `clv-core`).
 * Bir bayideki hata diğerlerini durdurmaz.
 */
export async function recomputeAllDealerCustomerStats(
  now: Date = new Date()
): Promise<{ dealers: number; rows: number; failed: number }> {
  const dealers = await prisma.consumption.groupBy({ by: ['dealerId'], _count: { _all: true } });
  let rows = 0;
  let failed = 0;
  for (const d of dealers) {
    try {
      rows += await recomputeDealerCustomerStats(d.dealerId, now);
    } catch (err) {
      failed++;
      console.error('[DEALER_CUSTOMER_STATS] bayi yeniden hesaplanamadı:', d.dealerId, err);
    }
  }
  return { dealers: dealers.length, rows, failed };
}

export type DealerStatsSort = 'spend' | 'churn' | 'recent';

/**
 * Bayi uçlarının OKUMA yolu: önce kalıcı `DealerCustomerStats`; hiç satır yoksa canlı ve
 * bayi kapsamlı hesap (sonuç arka planda kalıcılaştırılmaz — cron işi).
 */
export async function getDealerCustomerStats(
  dealerId: string,
  options: { sort?: DealerStatsSort; limit?: number; now?: Date } = {}
): Promise<{ stats: DealerCustomerStat[]; source: 'persisted' | 'live'; calculatedAt: Date | null }> {
  const sort = options.sort ?? 'spend';
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 1000);
  const orderBy =
    sort === 'churn'
      ? [{ churnRisk: { sort: 'desc' as const, nulls: 'last' as const } }, { totalSpend: 'desc' as const }]
      : sort === 'recent'
        ? [{ lastVisitAt: { sort: 'desc' as const, nulls: 'last' as const } }]
        : [{ totalSpend: 'desc' as const }];

  const persisted = await prisma.dealerCustomerStats.findMany({
    where: { dealerId },
    orderBy,
    take: limit,
  });
  if (persisted.length > 0) {
    return {
      source: 'persisted',
      calculatedAt: persisted.reduce<Date | null>(
        (min, r) => (min == null || r.calculatedAt < min ? r.calculatedAt : min),
        null
      ),
      stats: persisted.map((r) => ({
        dealerId: r.dealerId,
        customerId: r.customerId,
        totalSpend: Number(r.totalSpend),
        visitCount: r.visitCount,
        avgOrderValue: Number(r.avgOrderValue),
        reviewCount: r.reviewCount,
        avgRating: r.avgRating,
        firstVisitAt: r.firstVisitAt,
        lastVisitAt: r.lastVisitAt,
        churnRisk: r.churnRisk,
        segmentKey: (r.segmentKey as DealerSegmentKey | null) ?? null,
      })),
    };
  }

  const live = await computeDealerCustomerStats(dealerId, { now: options.now });
  const sorted = [...live].sort((a, b) => {
    if (sort === 'churn') return (b.churnRisk ?? -1) - (a.churnRisk ?? -1) || b.totalSpend - a.totalSpend;
    if (sort === 'recent') return (b.lastVisitAt?.getTime() ?? 0) - (a.lastVisitAt?.getTime() ?? 0);
    return b.totalSpend - a.totalSpend;
  });
  return { source: 'live', calculatedAt: null, stats: sorted.slice(0, limit) };
}

/**
 * Bu bayide kayıp riski yüksek ve BU BAYİDE uzun süredir pasif müşteriler (churn müdahalesi,
 * risk segmenti gibi arka plan işleri için). Platform geneli CLV'nin yerine geçer: risk yalnız bu
 * bayideki sinyallerden, pasiflik yalnız bu bayideki son ziyaretten hesaplanır (rakip işletmedeki
 * ziyaret ne sonucu ne de seçimi etkiler). Günlük iş için canlı ve kesin hesap kullanılır.
 */
export async function listDealerAtRiskCustomers(
  dealerId: string,
  options: { churnThreshold: number; inactiveBefore: Date; limit?: number; now?: Date }
): Promise<Array<{ customerId: string; churnRisk: number; lastVisitAt: Date | null }>> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 500);
  const stats = await computeDealerCustomerStats(dealerId, { now: options.now });
  return stats
    .filter(
      (s): s is DealerCustomerStat & { churnRisk: number } =>
        s.churnRisk != null &&
        s.churnRisk >= options.churnThreshold &&
        (s.lastVisitAt == null || s.lastVisitAt.getTime() < options.inactiveBefore.getTime())
    )
    .sort((a, b) => b.churnRisk - a.churnRisk)
    .slice(0, limit)
    .map((s) => ({ customerId: s.customerId, churnRisk: s.churnRisk, lastVisitAt: s.lastVisitAt }));
}

/** Bayinin müşteri sayısı (kalıcı tablo boşsa canlı). */
export async function countDealerCustomers(dealerId: string): Promise<number> {
  const persisted = await prisma.dealerCustomerStats.count({ where: { dealerId } });
  if (persisted > 0) return persisted;
  const rows = await prisma.consumption.groupBy({ by: ['customerId'], where: { dealerId } });
  return rows.length;
}

/**
 * Segment özeti için bayinin TÜM müşteri satırları (yalnız gereken alanlar). Kalıcı tablo boşsa
 * canlı bayi kapsamlı hesap. Platform geneli CLV/segment ASLA okunmaz.
 */
export async function listDealerSegmentRows(
  dealerId: string,
  now: Date = new Date()
): Promise<{ rows: Array<{ totalSpent: number; predictedChurn: number | null; segmentName: string | null }>; source: 'persisted' | 'live' }> {
  const persisted = await prisma.dealerCustomerStats.findMany({
    where: { dealerId },
    select: { totalSpend: true, churnRisk: true, segmentKey: true },
    take: 50_000,
  });
  const nameOf = (key: string | null) =>
    key && key in DEALER_SEGMENT_NAME ? DEALER_SEGMENT_NAME[key as DealerSegmentKey] : null;
  if (persisted.length > 0) {
    return {
      source: 'persisted',
      rows: persisted.map((r) => ({
        totalSpent: Number(r.totalSpend),
        predictedChurn: r.churnRisk,
        segmentName: nameOf(r.segmentKey),
      })),
    };
  }
  const live = await computeDealerCustomerStats(dealerId, { now });
  return {
    source: 'live',
    rows: live.map((s) => ({ totalSpent: s.totalSpend, predictedChurn: s.churnRisk, segmentName: nameOf(s.segmentKey) })),
  };
}
