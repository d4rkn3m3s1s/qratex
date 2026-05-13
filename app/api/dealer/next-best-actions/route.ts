import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { buildNextBestActions } from '@/lib/next-best-action';


export const dynamic = 'force-dynamic';

export async function GET() {
  try {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.role === 'DEALER' ? auth.session.user.id : undefined;
  if (!dealerId && auth.session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const targetDealerId = dealerId ?? (await prisma.user.findFirst({ where: { role: 'DEALER' }, select: { id: true } }))?.id;
  if (!targetDealerId) {
    return NextResponse.json({ actions: [] }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  const [
    totalQRCodes,
    totalFeedbacks,
    negativeCount,
    actionItems,
    churnFeedbacks,
    worstQrRow,
  ] = await Promise.all([
    prisma.qRCode.count({ where: { dealerId: targetDealerId } }),
    prisma.feedback.count({
      where: { deletedAt: null, qrCode: { dealerId: targetDealerId } },
    }),
    prisma.feedback.count({
      where: {
        deletedAt: null,
        qrCode: { dealerId: targetDealerId },
        OR: [{ rating: { lte: 2 } }, { sentiment: 'negative' }],
      },
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
    prisma.feedback.groupBy({
      by: ['qrCodeId'],
      where: { deletedAt: null, qrCode: { dealerId: targetDealerId } },
      _avg: { rating: true },
      _count: { _all: true },
      orderBy: { _avg: { rating: 'asc' } },
      take: 1,
    }),
  ]);

  const worstAvg = worstQrRow[0]?._avg.rating;
  const lowestRatedQrId =
    worstQrRow[0] &&
    (worstQrRow[0]._count._all ?? 0) > 0 &&
    worstAvg != null &&
    worstAvg < 4
      ? worstQrRow[0].qrCodeId
      : undefined;

  const actions = buildNextBestActions({
    totalQRCodes,
    totalFeedbacks,
    negativeCount,
    pendingActionCount: actionItems,
    highChurnCount: churnFeedbacks,
    lowestRatedQrId,
  });

  return NextResponse.json({ actions }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Next-best-actions error:', error);
    return NextResponse.json(
      { error: 'Öneriler yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
