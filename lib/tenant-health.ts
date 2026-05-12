/**
 * Tenant health score (P1 item 12).
 * Her işletme için risk skoru: kullanım düşüşü, negatif artışı, aksiyon yapılmaması.
 */
import { prisma } from '@/lib/prisma';

export interface TenantHealthResult {
  dealerId: string;
  dealerName: string | null;
  healthScore: number; // 0-100, 100 = sağlıklı
  usageTrend: number; // son 7 / önceki 7 feedback oranı (1 = sabit)
  negativeRate: number; // son 7 gün negatif oranı (0-100)
  negativeTrend: number; // son 7 vs önceki 7 negatif oran farkı
  actionCompletionRate: number; // son 30 gün aksiyon tamamlama
}

export async function getTenantHealth(dealerIds?: string[]): Promise<TenantHealthResult[]> {
  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prev7 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const dealers = await prisma.user.findMany({
    where: { role: 'DEALER', ...(dealerIds?.length ? { id: { in: dealerIds } } : {}) },
    select: { id: true, name: true, businessName: true },
  });

  const results: TenantHealthResult[] = [];
  for (const d of dealers) {
    const [last7Fb, prev7Fb, last7Neg, prev7Neg, actionTotal, actionDone] = await Promise.all([
      prisma.feedback.count({
        where: { qrCode: { dealerId: d.id }, deletedAt: null, createdAt: { gte: last7 } },
      }),
      prisma.feedback.count({
        where: { qrCode: { dealerId: d.id }, deletedAt: null, createdAt: { gte: prev7, lt: last7 } },
      }),
      prisma.feedback.count({
        where: {
          qrCode: { dealerId: d.id },
          deletedAt: null,
          createdAt: { gte: last7 },
          OR: [{ rating: { lte: 2 } }, { sentiment: 'negative' }],
        },
      }),
      prisma.feedback.count({
        where: {
          qrCode: { dealerId: d.id },
          deletedAt: null,
          createdAt: { gte: prev7, lt: last7 },
          OR: [{ rating: { lte: 2 } }, { sentiment: 'negative' }],
        },
      }),
      prisma.actionItem.count({
        where: { dealerId: d.id, createdAt: { gte: last30 } },
      }),
      prisma.actionItem.count({
        where: { dealerId: d.id, status: 'done', createdAt: { gte: last30 } },
      }),
    ]);

    const usageTrend = prev7Fb > 0 ? last7Fb / prev7Fb : 1;
    const last7NegRate = last7Fb > 0 ? (last7Neg / last7Fb) * 100 : 0;
    const prev7NegRate = prev7Fb > 0 ? (prev7Neg / prev7Fb) * 100 : 0;
    const negativeTrend = last7NegRate - prev7NegRate;
    const actionCompletionRate = actionTotal > 0 ? (actionDone / actionTotal) * 100 : 100;

    // Health score: usage drop, negative rise, low action completion → lower score
    let score = 100;
    if (usageTrend < 0.5) score -= 30;
    else if (usageTrend < 0.8) score -= 15;
    if (negativeTrend > 20) score -= 25;
    else if (negativeTrend > 10) score -= 10;
    if (actionCompletionRate < 50 && actionTotal > 0) score -= 20;
    else if (actionCompletionRate < 70 && actionTotal > 0) score -= 10;
    if (last7NegRate > 50) score -= 15;
    score = Math.max(0, Math.min(100, score));

    results.push({
      dealerId: d.id,
      dealerName: d.businessName || d.name,
      healthScore: Math.round(score),
      usageTrend,
      negativeRate: Math.round(last7NegRate * 10) / 10,
      negativeTrend: Math.round(negativeTrend * 10) / 10,
      actionCompletionRate: Math.round(actionCompletionRate * 10) / 10,
    });
  }

  return results.sort((a, b) => a.healthScore - b.healthScore);
}
