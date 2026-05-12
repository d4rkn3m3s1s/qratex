/**
 * Business outcome ekranı (P2 item 7).
 * Puan yerine tekrar ziyaret, şikayet düşüşü, gelir etkisi (proxy).
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  let consumptionCount = 0;
  let uniqueCount = 0;
  try {
    const [cnt, grouped] = await Promise.all([
      prisma.consumption.count({ where: { dealerId } }),
      prisma.consumption.groupBy({ by: ['customerId'], where: { dealerId } }),
    ]);
    consumptionCount = cnt ?? 0;
    uniqueCount = grouped?.length ?? 0;
  } catch {
    /* Consumption model in schema; safe fallback */
  }

  const [negativeThisMonth, negativeLastMonth, totalThisMonth, totalLastMonth, remedyOffers, remedyAccepted] =
    await Promise.all([
      prisma.feedback.count({
        where: {
          qrCode: { dealerId },
          deletedAt: null,
          createdAt: { gte: thisMonth },
          OR: [{ rating: { lte: 2 } }, { sentiment: 'negative' }],
        },
      }),
      prisma.feedback.count({
        where: {
          qrCode: { dealerId },
          deletedAt: null,
          createdAt: { gte: lastMonth, lt: thisMonth },
          OR: [{ rating: { lte: 2 } }, { sentiment: 'negative' }],
        },
      }),
      prisma.feedback.count({
        where: { qrCode: { dealerId }, deletedAt: null, createdAt: { gte: thisMonth } },
      }),
      prisma.feedback.count({
        where: { qrCode: { dealerId }, deletedAt: null, createdAt: { gte: lastMonth, lt: thisMonth } },
      }),
      prisma.remedyOffer.count({ where: { dealerId } }),
      prisma.remedyOffer.count({ where: { dealerId, status: 'accepted' } }),
    ]);

  const repeatVisitRate =
    uniqueCount > 0 && consumptionCount > 0 ? Math.max(0, (consumptionCount / uniqueCount) - 1) : 0;
  const negRateThis = totalThisMonth > 0 ? (negativeThisMonth / totalThisMonth) * 100 : 0;
  const negRateLast = totalLastMonth > 0 ? (negativeLastMonth / totalLastMonth) * 100 : 0;
  const complaintReduction = Math.round((negRateLast - negRateThis) * 10) / 10;
  const remedyAcceptRate = remedyOffers > 0 ? (remedyAccepted / remedyOffers) * 100 : 0;

  return NextResponse.json({
    businessOutcomes: {
      repeatVisitRate: Math.round(repeatVisitRate * 100) / 100,
      complaintReduction,
      remedyAcceptRate: Math.round(remedyAcceptRate * 10) / 10,
      negativeRateThisMonth: Math.round(negRateThis * 10) / 10,
    },
  });
}
