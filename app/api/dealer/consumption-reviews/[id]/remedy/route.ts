
export const dynamic = 'force-dynamic';

/**
 * 1-tık telafi (tüketim yorumu): RemedyOffer oluşturur, müşteriye bildirim gider.
 * QR feedback remedy ile aynı akış; ConsumptionReview üzerinden tetiklenir.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import { checkIdempotency, storeIdempotency } from '@/lib/idempotency';
import { z } from 'zod';
import { assertModuleEnabled } from '@/lib/module-gate';
import { appendRemedyTimelineEvent } from '@/lib/remedy-timeline';

const remedyOptionSchema = z.object({
  type: z.string(),
  label: z.string(),
  unit: z.string().optional(),
  values: z.array(z.union([z.number(), z.string()])),
});
const bodySchema = z.object({
  message: z.string().max(500).optional(),
  sendNotification: z.boolean().default(true),
  options: z.array(remedyOptionSchema).optional(),
  queueForApproval: z.boolean().optional(),
});

const DEFAULT_OPTIONS = [
  { type: 'discount', label: 'İndirim', unit: '%', values: [10, 15, 20, 25, 30] },
  { type: 'points', label: 'Puan', unit: 'puan', values: [50, 100, 150, 200] },
  { type: 'free_item', label: 'Ücretsiz ürün/içecek', unit: 'adet', values: [1] },
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await assertModuleEnabled('remedy_offers');
  if (gate) return gate;
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { id: reviewId } = await params;
  const idemCheck = await checkIdempotency(request, 'remedy-consumption');
  if ('error' in idemCheck) return idemCheck.error;
  if (idemCheck.cached) return idemCheck.response;
  const idemKey = idemCheck.key;

  const review = await prisma.consumptionReview.findUnique({
    where: { id: reviewId },
    include: {
      consumption: { select: { dealerId: true } },
      customer: { select: { id: true } },
    },
  });

  if (!review) {
    return NextResponse.json({ error: 'Tüketim yorumu bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
  }
  if (session.user.role === 'DEALER' && review.consumption.dealerId !== session.user.id) {
    return NextResponse.json({ error: 'Bu yoruma telafi başlatma yetkiniz yok' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  const message =
    parsed.success && parsed.data.message
      ? parsed.data.message
      : 'Deneyiminiz için özür dileriz. Aşağıdan telafi türü ve miktarınızı seçin.';
  const queueForApproval = !!(parsed.success && parsed.data.queueForApproval);
  const sendNotification = queueForApproval
    ? false
    : parsed.success
      ? parsed.data.sendNotification
      : true;
  const options = parsed.success && parsed.data.options?.length ? parsed.data.options : DEFAULT_OPTIONS;

  let remedyOfferId: string | null = null;
  const userId = review.customerId;
  const dealerId = review.consumption.dealerId;

  if (userId && (queueForApproval || sendNotification)) {
    const offer = await prisma.remedyOffer.create({
      data: {
        consumptionReviewId: reviewId,
        dealerId,
        userId,
        message,
        status: queueForApproval ? 'awaiting_dealer_approval' : 'pending',
        options: options as object,
      },
    });
    remedyOfferId = offer.id;

    await appendRemedyTimelineEvent(prisma, offer.id, 'created', 'Teklif oluşturuldu', {
      preview: message.slice(0, 120),
    });
    if (queueForApproval) {
      await appendRemedyTimelineEvent(prisma, offer.id, 'queued', 'Onay kuyruğunda');
    } else if (sendNotification) {
      await appendRemedyTimelineEvent(prisma, offer.id, 'notified', 'Müşteriye bildirim gönderildi');
    }

    if (!queueForApproval && sendNotification) {
      await prisma.notification.create({
        data: {
          userId,
          title: 'Telafi Fırsatı',
          message: 'Size özel bir telafi hazır. Tür ve miktar seçmek için tıklayın.',
          type: 'info',
          data: {
            consumptionReviewId: reviewId,
            type: 'remedy_campaign',
            remedyOfferId: offer.id,
          },
        },
      });
    }
  }

  await prisma.analyticsEvent.create({
    data: {
      userId: session.user.id,
      event: 'remedy_campaign_triggered',
      category: 'campaign',
      data: { consumptionReviewId: reviewId, customerId: userId, remedyOfferId },
    },
  });

  const resBody = {
    success: true,
    consumptionReviewId: reviewId,
    remedyOfferId,
    notificationSent: !!(userId && !queueForApproval && sendNotification),
    queuedForApproval: !!queueForApproval,
    message: queueForApproval
      ? 'Telafi taslağı onay kuyruğuna alındı.'
      : 'Telafi teklifi gönderildi. Müşteri tür ve miktar seçecek.',
  };
  if (idemKey) await storeIdempotency(idemKey, 'remedy-consumption', 200, resBody);
  return NextResponse.json(resBody, { headers: PRIVATE_NO_STORE_HEADERS });
}
