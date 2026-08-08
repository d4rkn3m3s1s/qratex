/**
 * Müşteri Yaşam Boyu Değeri (CLV) + Segment çekirdeği. CustomerLifetimeValue ve
 * CustomerSegment modelleri artık gerçek bir hesaplama döngüsüne bağlı (Inngest
 * cron → /api/internal/inngest/calculate-clv).
 *
 * Veri kaynakları: Consumption (totalSpent/visits/avgOrderValue/first-last),
 * Feedback.churnRisk (AI'dan gelen 0-1 olasılık → predictedChurn + LOW/MED/HIGH).
 * Segment, CLV metriklerinden kural tabanlı atanır.
 */
import { prisma } from '@/lib/prisma';

export const DEFAULT_SEGMENTS = [
  { name: 'VIP', description: 'Yüksek yaşam boyu değeri', criteria: { minTotalSpent: 5000 }, color: '#FFD700' },
  { name: 'Sadık', description: 'Sık dönen müşteri', criteria: { minTotalVisits: 10 }, color: '#45B7D1' },
  { name: 'Risk Altında', description: 'Yüksek kayıp olasılığı', criteria: { minChurnRisk: 0.5 }, color: '#FF6B6B' },
  { name: 'Uyuyan', description: '30+ gündür pasif', criteria: { minDaysSinceLastVisit: 30 }, color: '#95A5A6' },
  { name: 'Yeni', description: 'Son 30 günde ilk alışveriş', criteria: { maxDaysSincePurchase: 30 }, color: '#4ECDC4' },
] as const;

/** Varsayılan segmentleri oluşturur (idempotent upsert). Segment ad→id haritası döner. */
export async function ensureDefaultSegments(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const seg of DEFAULT_SEGMENTS) {
    const row = await prisma.customerSegment.upsert({
      where: { name: seg.name },
      update: {},
      create: {
        name: seg.name,
        description: seg.description,
        criteria: seg.criteria as object,
        color: seg.color,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    map.set(row.name, row.id);
  }
  return map;
}

export function churnBucket(predictedChurn: number | null): string | null {
  if (predictedChurn == null) return null;
  if (predictedChurn >= 0.5) return 'HIGH';
  if (predictedChurn >= 0.3) return 'MEDIUM';
  return 'LOW';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** CLV metriklerinden segment seçer (öncelik: Risk > VIP > Sadık > Uyuyan > Yeni). */
export function pickSegment(
  metrics: {
    totalSpent: number;
    totalVisits: number;
    predictedChurn: number | null;
    firstPurchaseAt: Date | null;
    lastPurchaseAt: Date | null;
  },
  segments: Map<string, string>,
  now: Date
): string | null {
  if (metrics.predictedChurn != null && metrics.predictedChurn >= 0.5) return segments.get('Risk Altında') ?? null;
  if (metrics.totalSpent >= 5000) return segments.get('VIP') ?? null;
  if (metrics.totalVisits >= 10) return segments.get('Sadık') ?? null;
  if (metrics.lastPurchaseAt && now.getTime() - metrics.lastPurchaseAt.getTime() >= 30 * DAY_MS)
    return segments.get('Uyuyan') ?? null;
  if (metrics.firstPurchaseAt && now.getTime() - metrics.firstPurchaseAt.getTime() <= 30 * DAY_MS)
    return segments.get('Yeni') ?? null;
  return null;
}

/**
 * Tüm müşteriler için CLV hesaplar ve upsert eder. Segment ataması dahil.
 * Döner: işlenen müşteri sayısı.
 */
export async function recomputeAllCLV(now: Date = new Date()): Promise<{ processed: number }> {
  const segments = await ensureDefaultSegments();

  // Tüketim toplulaştırması: müşteri başına toplam/ziyaret/ortalama/ilk-son.
  const spendAgg = await prisma.consumption.groupBy({
    by: ['customerId'],
    _sum: { amount: true },
    _count: { _all: true },
    _avg: { amount: true },
    _min: { createdAt: true },
    _max: { createdAt: true },
  });

  // Churn riski: müşteri başına ortalama churn olasılığı — İKİ AI kaynağından:
  // (1) Feedback.churnRisk (QR geri bildirimi) ve (2) ConsumptionReview.churnRisk
  //     (tüketim yorumu — önceden yalnız ölü bir AnalyticsEvent'teydi, artık okunuyor).
  // İki kaynağın örneklem sayısıyla AĞIRLIKLI ortalaması alınır (adil birleşim).
  const [fbChurn, crChurn] = await Promise.all([
    prisma.feedback.groupBy({
      by: ['userId'],
      where: { userId: { not: null }, churnRisk: { not: null } },
      _avg: { churnRisk: true },
      _count: { churnRisk: true },
    }),
    prisma.consumptionReview.groupBy({
      by: ['customerId'],
      where: { churnRisk: { not: null } },
      _avg: { churnRisk: true },
      _count: { churnRisk: true },
    }),
  ]);
  // userId → { sum: ağırlıklı churn toplamı, n: örneklem sayısı }
  const churnAccum = new Map<string, { sum: number; n: number }>();
  const addChurn = (userId: string | null, avg: number | null, n: number) => {
    if (!userId || avg == null || n <= 0) return;
    const cur = churnAccum.get(userId) ?? { sum: 0, n: 0 };
    cur.sum += avg * n;
    cur.n += n;
    churnAccum.set(userId, cur);
  };
  for (const c of fbChurn) addChurn(c.userId, c._avg.churnRisk, c._count.churnRisk);
  for (const c of crChurn) addChurn(c.customerId, c._avg.churnRisk, c._count.churnRisk);
  const churnByUser = new Map<string, number>();
  for (const [userId, { sum, n }] of churnAccum) churnByUser.set(userId, sum / n);

  let processed = 0;
  for (const row of spendAgg) {
    const userId = row.customerId;
    const totalSpent = row._sum.amount ?? 0;
    const totalVisits = row._count._all ?? 0;
    const avgOrderValue = row._avg.amount ?? 0;
    const firstPurchaseAt = row._min.createdAt ?? null;
    const lastPurchaseAt = row._max.createdAt ?? null;
    const predictedChurn = churnByUser.get(userId) ?? null;
    const churnRisk = churnBucket(predictedChurn);
    const segmentId = pickSegment(
      { totalSpent, totalVisits, predictedChurn, firstPurchaseAt, lastPurchaseAt },
      segments,
      now
    );

    await prisma.customerLifetimeValue.upsert({
      where: { userId },
      update: {
        totalSpent,
        totalVisits,
        avgOrderValue,
        firstPurchaseAt,
        lastPurchaseAt,
        predictedChurn,
        churnRisk,
        segmentId,
        calculatedAt: now,
      },
      create: {
        userId,
        totalSpent,
        totalVisits,
        avgOrderValue,
        firstPurchaseAt,
        lastPurchaseAt,
        predictedChurn,
        churnRisk,
        segmentId,
        calculatedAt: now,
      },
    });
    processed++;
  }

  return { processed };
}
