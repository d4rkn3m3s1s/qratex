import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';


export const dynamic = 'force-dynamic';

/**
 * Bayi QR geri bildirimini ilk kez açtığını işaretler (müşteri şeffaf yolculuk).
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id: feedbackId } = await params;
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      include: { qrCode: { select: { dealerId: true } } },
    });

    if (!feedback) {
      return NextResponse.json({ error: 'Geri bildirim bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (session.user.role === 'DEALER' && feedback.qrCode.dealerId !== session.user.id) {
      return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (feedback.dealerFirstViewedAt) {
      return NextResponse.json({
        success: true,
        feedbackId,
        dealerFirstViewedAt: feedback.dealerFirstViewedAt.toISOString(),
        alreadyMarked: true,
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const viewedAt = new Date();
    const scopeWhere =
      session.user.role === 'DEALER'
        ? { id: feedbackId, dealerFirstViewedAt: null, qrCode: { dealerId: session.user.id } }
        : { id: feedbackId, dealerFirstViewedAt: null };

    const write = await prisma.feedback.updateMany({
      where: scopeWhere,
      data: { dealerFirstViewedAt: viewedAt },
    });

    if (write.count === 0) {
      const again = await prisma.feedback.findUnique({
        where: { id: feedbackId },
        select: { dealerFirstViewedAt: true },
      });
      return NextResponse.json({
        success: true,
        feedbackId,
        dealerFirstViewedAt: again?.dealerFirstViewedAt?.toISOString() ?? null,
        alreadyMarked: true,
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    return NextResponse.json({
      success: true,
      feedbackId,
      dealerFirstViewedAt: viewedAt.toISOString(),
      alreadyMarked: false,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Feedback viewed PATCH:', error);
    return NextResponse.json(
      { error: 'İşlem başarısız' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
