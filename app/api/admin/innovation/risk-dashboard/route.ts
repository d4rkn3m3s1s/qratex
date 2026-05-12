import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const SLA_HOURS = 48;

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const now = new Date();
  const slaCutoff = new Date(now.getTime() - SLA_HOURS * 3600 * 1000);

  const since14d = new Date(now.getTime() - 14 * 24 * 3600 * 1000);

  const [
    remedyQueueApproval,
    remedyPendingStale,
    flashExpiring24h,
    recentFeedback,
  ] = await Promise.all([
    prisma.remedyOffer.count({ where: { status: 'awaiting_dealer_approval' } }),
    prisma.remedyOffer.count({
      where: {
        status: { in: ['pending', 'awaiting_dealer_approval'] },
        createdAt: { lt: slaCutoff },
      },
    }),
    prisma.dealerFlashOffer.count({
      where: {
        isActive: true,
        validTo: { lte: new Date(now.getTime() + 24 * 3600 * 1000), gte: now },
      },
    }),
    prisma.feedback.findMany({
      where: { createdAt: { gte: since14d } },
      select: { qrCodeId: true, rating: true },
    }),
  ]);

  const byQr = new Map<string, { sum: number; n: number }>();
  for (const f of recentFeedback) {
    const cur = byQr.get(f.qrCodeId) || { sum: 0, n: 0 };
    cur.sum += f.rating;
    cur.n += 1;
    byQr.set(f.qrCodeId, cur);
  }

  const lowRatedDealerRows = [...byQr.entries()]
    .filter(([, v]) => v.n >= 5 && v.sum / v.n < 3)
    .map(([qrCodeId, v]) => ({
      qrCodeId,
      avgRating: v.sum / v.n,
      feedbackCount: v.n,
    }))
    .slice(0, 30);

  const qrIds = lowRatedDealerRows.map((r) => r.qrCodeId);
  const qrs = await prisma.qRCode.findMany({
    where: { id: { in: qrIds } },
    select: {
      id: true,
      dealerId: true,
      dealer: { select: { businessName: true, name: true, email: true } },
    },
  });
  const qrMap = new Map(qrs.map((q) => [q.id, q]));

  const orphanRiskItems = lowRatedDealerRows.map((row) => {
    const qr = qrMap.get(row.qrCodeId);
    return {
      type: 'low_rating_cluster' as const,
      qrCodeId: row.qrCodeId,
      avgRating: row.avgRating,
      feedbackCount: row.feedbackCount,
      dealerId: qr?.dealerId,
      dealerLabel: qr?.dealer.businessName || qr?.dealer.name || qr?.dealer.email,
    };
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    summary: {
      remedyAwaitingApproval: remedyQueueApproval,
      remedyBreachingSlaHours: SLA_HOURS,
      remedyStaleOpenCount: remedyPendingStale,
      flashOffersEndingSoon24h: flashExpiring24h,
      lowRatedClusters: orphanRiskItems.length,
    },
    orphanRiskItems,
    priorityHints: [
      remedyPendingStale > 0
        ? `Telafi: ${remedyPendingStale} kayıt ${SLA_HOURS} saatten eski açık durumda.`
        : null,
      remedyQueueApproval > 0 ? `Onay kuyruğu: ${remedyQueueApproval} telafi bekliyor.` : null,
      flashExpiring24h > 0 ? `${flashExpiring24h} flash teklif 24 saat içinde bitiyor.` : null,
    ].filter(Boolean),
  });
}
