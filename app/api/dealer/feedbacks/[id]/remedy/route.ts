
export const dynamic = 'force-dynamic';

/**
 * 1-tık telafi: RemedyOffer oluşturur, müşteriye bildirim gider; müşteri tür/miktar seçip kabul eder.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import { checkIdempotency, storeIdempotency } from '@/lib/idempotency';
import { z } from 'zod';
import { assertModuleEnabled } from '@/lib/module-gate';
import { appendRemedyTimelineEvent } from '@/lib/remedy-timeline';
import { getRemedyOptions } from '@/lib/remedy-options';

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
  /** true: müşteriye bildirim yok, onay kuyruğuna düşer (awaiting_dealer_approval) */
  queueForApproval: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await assertModuleEnabled('remedy_offers');
  if (gate) return gate;
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { id: feedbackId } = await params;
  const idemCheck = await checkIdempotency(request, 'remedy-feedback');
  if ('error' in idemCheck) return idemCheck.error;
  if (idemCheck.cached) return idemCheck.response;
  const idemKey = idemCheck.key;

  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    include: { qrCode: { select: { dealerId: true, locationId: true } }, user: { select: { id: true } } },
  });

  if (!feedback) {
    return NextResponse.json({ error: 'Geri bildirim bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
  }
  if (session.user.role === 'DEALER' && feedback.qrCode.dealerId !== session.user.id) {
    return NextResponse.json({ error: 'Bu geri bildirime telafi başlatma yetkiniz yok' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
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
  const options =
    parsed.success && parsed.data.options?.length
      ? parsed.data.options
      : await getRemedyOptions(feedback.qrCode.dealerId, feedback.qrCode.locationId);

  let remedyOfferId: string | null = null;

  if (feedback.userId && (queueForApproval || sendNotification)) {
    const offer = await prisma.remedyOffer.create({
      data: {
        feedbackId: feedbackId,
        dealerId: feedback.qrCode.dealerId,
        userId: feedback.userId,
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
          userId: feedback.userId,
          title: 'Telafi Fırsatı',
          message: 'Size özel bir telafi hazır. Tür ve miktar seçmek için tıklayın.',
          type: 'info',
          data: {
            feedbackId,
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
      data: {
        feedbackId,
        customerId: feedback.userId ?? null,
        remedyOfferId,
        queuedForApproval: !!queueForApproval,
      },
    },
  });

  const resBody = {
    success: true,
    feedbackId,
    remedyOfferId,
    notificationSent: !!(feedback.userId && !queueForApproval && sendNotification),
    queuedForApproval: !!queueForApproval,
    message: queueForApproval
      ? 'Telafi taslağı onay kuyruğuna alındı. Yayınlamadan müşteri görmez.'
      : 'Telafi teklifi gönderildi. Müşteri tür ve miktar seçecek.',
  };
  if (idemKey) await storeIdempotency(idemKey, 'remedy-feedback', 200, resBody);
  return NextResponse.json(resBody, { headers: PRIVATE_NO_STORE_HEADERS });
}
