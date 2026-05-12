import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';


export const dynamic = 'force-dynamic';

/**
 * Bayi QR geri bildirimini ilk kez açtığını işaretler (müşteri şeffaf yolculuk).
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { id: feedbackId } = await params;
  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    include: { qrCode: { select: { dealerId: true } } },
  });

  if (!feedback) {
    return NextResponse.json({ error: 'Geri bildirim bulunamadı' }, { status: 404 });
  }
  if (session.user.role === 'DEALER' && feedback.qrCode.dealerId !== session.user.id) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  if (feedback.dealerFirstViewedAt) {
    return NextResponse.json({
      success: true,
      feedbackId,
      dealerFirstViewedAt: feedback.dealerFirstViewedAt.toISOString(),
      alreadyMarked: true,
    });
  }

  const updated = await prisma.feedback.update({
    where: { id: feedbackId },
    data: { dealerFirstViewedAt: new Date() },
  });

  return NextResponse.json({
    success: true,
    feedbackId,
    dealerFirstViewedAt: updated.dealerFirstViewedAt!.toISOString(),
    alreadyMarked: false,
  });
}
