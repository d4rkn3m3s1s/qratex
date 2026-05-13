import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import { z } from 'zod';
import { appendRemedyTimelineEvent } from '@/lib/remedy-timeline';


export const dynamic = 'force-dynamic';

const actionSchema = z.object({
  action: z.enum(['publish', 'reject']),
});

/**
 * publish: awaiting_dealer_approval → pending + müşteri bildirimi
 * reject: awaiting_dealer_approval → rejected
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id: offerId } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'action: publish | reject gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const offer = await prisma.remedyOffer.findUnique({
      where: { id: offerId },
      select: {
        id: true,
        dealerId: true,
        userId: true,
        status: true,
        message: true,
        options: true,
        feedbackId: true,
        consumptionReviewId: true,
      },
    });

    if (!offer) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (session.user.role === 'DEALER' && offer.dealerId !== session.user.id) {
      return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (offer.status !== 'awaiting_dealer_approval') {
      return NextResponse.json(
        { error: 'Bu teklif onay kuyruğunda değil', currentStatus: offer.status }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const awaitingWhere =
      session.user.role === 'ADMIN'
        ? { id: offerId, status: 'awaiting_dealer_approval' as const }
        : { id: offerId, dealerId: session.user.id, status: 'awaiting_dealer_approval' as const };

    if (parsed.data.action === 'reject') {
      const n = await prisma.remedyOffer.updateMany({
        where: awaitingWhere,
        data: { status: 'rejected' },
      });
      if (n.count === 0) {
        return NextResponse.json(
          { error: 'Teklif durumu değişti veya bulunamadı', currentStatus: offer.status },
          { status: 400 , headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      await prisma.analyticsEvent.create({
        data: {
          userId: session.user.id,
          event: 'remedy_offer_rejected_by_dealer',
          category: 'campaign',
          data: { offerId },
        },
      });
      return NextResponse.json({ success: true, status: 'rejected' }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    // publish
    const published = await prisma.remedyOffer.updateMany({
      where: awaitingWhere,
      data: { status: 'pending' },
    });
    if (published.count === 0) {
      return NextResponse.json(
        { error: 'Teklif durumu değişti veya bulunamadı', currentStatus: offer.status },
        { status: 400 , headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    await appendRemedyTimelineEvent(prisma, offerId, 'published', 'Teklif müşteriye yayınlandı');

    if (offer.userId) {
      try {
        await prisma.notification.create({
          data: {
            userId: offer.userId,
            title: 'Telafi Fırsatı',
            message: 'Size özel bir telafi hazır. Tür ve miktar seçmek için tıklayın.',
            type: 'info',
            data: {
              type: 'remedy_campaign',
              remedyOfferId: offer.id,
              ...(offer.feedbackId ? { feedbackId: offer.feedbackId } : {}),
              ...(offer.consumptionReviewId
                ? { consumptionReviewId: offer.consumptionReviewId }
                : {}),
            },
          },
        });
        await appendRemedyTimelineEvent(prisma, offerId, 'notified', 'Müşteriye bildirim gönderildi');
      } catch {
        /* non-critical */
      }
    }

    await prisma.analyticsEvent.create({
      data: {
        userId: session.user.id,
        event: 'remedy_offer_published',
        category: 'campaign',
        data: { offerId, customerId: offer.userId },
      },
    });

    return NextResponse.json({
      success: true,
      status: 'pending',
      notificationSent: !!offer.userId,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('remedy-offers POST:', error);
    return NextResponse.json(
      { error: 'İşlem başarısız' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
