import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { buildNextBestActions } from '@/lib/next-best-action';


export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.role === 'DEALER' ? auth.session.user.id : undefined;
  if (!dealerId && auth.session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  const targetDealerId = dealerId ?? (await prisma.user.findFirst({ where: { role: 'DEALER' }, select: { id: true } }))?.id;
  if (!targetDealerId) {
    return NextResponse.json({ actions: [] });
  }

  const [qrCodes, feedbacks, actionItems, churnFeedbacks] = await Promise.all([
    prisma.qRCode.findMany({
      where: { dealerId: targetDealerId },
      select: {
        id: true,
        feedbacks: {
          select: { rating: true, sentiment: true },
        },
      },
    }),
    prisma.feedback.findMany({
      where: { deletedAt: null, qrCode: { dealerId: targetDealerId } },
      select: { id: true, rating: true, sentiment: true },
    }),
    prisma.actionItem.count({
      where: { dealerId: targetDealerId, status: { in: ['pending', 'assigned', 'in_progress'] } },
    }),
    prisma.feedback.count({
      where: {
        deletedAt: null,
        qrCode: { dealerId: targetDealerId },
        churnRisk: { gte: 0.7 },
      },
    }),
  ]);

  const negativeCount = feedbacks.filter(
    (f) => f.rating <= 2 || f.sentiment === 'negative'
  ).length;

  let lowestRatedQrId: string | undefined;
  if (qrCodes.length > 0) {
    const withAvg = qrCodes.map((q) => ({
      id: q.id,
      avg: q.feedbacks.length > 0
        ? q.feedbacks.reduce((s, f) => s + f.rating, 0) / q.feedbacks.length
        : 5,
    }));
    const min = withAvg.reduce((a, b) => (a.avg < b.avg ? a : b));
    if (min.avg < 4) lowestRatedQrId = min.id;
  }

  const actions = buildNextBestActions({
    totalQRCodes: qrCodes.length,
    totalFeedbacks: feedbacks.length,
    negativeCount,
    pendingActionCount: actionItems,
    highChurnCount: churnFeedbacks,
    lowestRatedQrId,
  });

  return NextResponse.json({ actions });
}
