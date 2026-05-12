import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { id: offerId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'action: publish | reject gerekli' }, { status: 400 });
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
    return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
  }
  if (session.user.role === 'DEALER' && offer.dealerId !== session.user.id) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 });
  }

  if (offer.status !== 'awaiting_dealer_approval') {
    return NextResponse.json(
      { error: 'Bu teklif onay kuyruğunda değil', currentStatus: offer.status },
      { status: 400 }
    );
  }

  if (parsed.data.action === 'reject') {
    await prisma.remedyOffer.update({
      where: { id: offerId },
      data: { status: 'rejected' },
    });
    await prisma.analyticsEvent.create({
      data: {
        userId: session.user.id,
        event: 'remedy_offer_rejected_by_dealer',
        category: 'campaign',
        data: { offerId },
      },
    });
    return NextResponse.json({ success: true, status: 'rejected' });
  }

  // publish
  await prisma.remedyOffer.update({
    where: { id: offerId },
    data: { status: 'pending' },
  });

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
  });
}
