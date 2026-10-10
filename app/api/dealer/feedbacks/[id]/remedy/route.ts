export const dynamic = 'force-dynamic';

/**
 * 1-tık telafi (QR geri bildirimi): RemedyOffer oluşturur.
 *
 * P0-22 / D7: Geçersiz gövde artık 400 döner — eskiden 500+ karakterlik mesajda zod başarısız
 * olunca `queueForApproval=false, sendNotification=true` varsayılanına düşülüp ONAYSIZ teklif
 * müşteriye gidiyordu. Belirsizlikte güvenli yön: kuyruğa al, bildirim gönderme.
 * Açık/kabul edilmiş teklif varken 409; anonim geri bildirimde 422 (sahte başarı yok).
 * Seçenekler bayinin şablon allowlist'inin alt kümesi olmak zorunda.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getRemedyOptions, restrictRemedyOptionsToAllowlist } from '@/lib/remedy-options';
import {
  createRemedyOffer,
  isRemedyOfferError,
  parseRemedyCreateBody,
  DEFAULT_REMEDY_MESSAGE,
  resolveRemedyMode,
} from '@/lib/remedy-offer-service';

const paramsSchema = z.object({ id: z.string().min(1).max(64) });

export const POST = defineRoute(
  {
    name: 'dealer.feedbacks.remedy.create',
    roles: ['DEALER', 'ADMIN'],
    module: 'remedy_offers',
    rateLimit: 'mutation',
    idempotent: true,
    params: paramsSchema,
    // Gövde servis içinde doğrulanır: hata mesajı Türkçe ve alana özel döner (sessiz varsayılan yok).
    schema: z.unknown(),
  },
  async ({ body: rawBody, params, user }) => {
    const parsedBody = parseRemedyCreateBody(rawBody);
    if (!parsedBody.ok) throw new ApiError('VALIDATION', parsedBody.message, { details: parsedBody.details });
    const body = parsedBody.body;
    const feedbackId = params.id;
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      select: { id: true, userId: true, qrCode: { select: { dealerId: true, locationId: true } } },
    });
    if (!feedback) throw new ApiError('NOT_FOUND', 'Geri bildirim bulunamadı.');
    if (user.role === 'DEALER' && feedback.qrCode.dealerId !== user.id) {
      throw new ApiError('FORBIDDEN', 'Bu geri bildirime telafi başlatma yetkiniz yok.');
    }
    if (!feedback.userId) {
      throw new ApiError(
        'NO_CUSTOMER',
        'Bu geri bildirim anonim bırakıldığı için telafi teklifi gönderilemez.',
        { status: 422 }
      );
    }

    const dealerId = feedback.qrCode.dealerId;
    const allowed = await getRemedyOptions(dealerId, feedback.qrCode.locationId);
    let options = allowed;
    if (body.options !== undefined) {
      const restricted = restrictRemedyOptionsToAllowlist(body.options, allowed);
      if (!restricted.ok) throw new ApiError('VALIDATION', restricted.reason);
      options = restricted.options;
    }

    const mode = resolveRemedyMode(body);
    const message = body.message || DEFAULT_REMEDY_MESSAGE;

    let result;
    try {
      result = await createRemedyOffer({
        source: { kind: 'feedback', feedbackId },
        dealerId,
        userId: feedback.userId,
        message,
        mode,
        options,
      });
    } catch (err) {
      if (isRemedyOfferError(err)) {
        throw new ApiError(err.code, err.message, {
          status: err.status,
          details: err.existingOfferId ? { existingOfferId: err.existingOfferId } : undefined,
        });
      }
      throw err;
    }

    try {
      await prisma.analyticsEvent.create({
        data: {
          userId: user.id,
          event: 'remedy_campaign_triggered',
          category: 'campaign',
          data: {
            feedbackId,
            customerId: feedback.userId,
            remedyOfferId: result.offerId,
            queuedForApproval: result.status === 'awaiting_dealer_approval',
          },
        },
      });
    } catch (e) {
      console.warn('[remedy] analytics yazılamadı:', e);
    }

    const queued = result.status === 'awaiting_dealer_approval';
    return ok(
      {
        feedbackId,
        remedyOfferId: result.offerId,
        status: result.status,
        notificationSent: result.notificationSent,
        queuedForApproval: queued,
        message: queued
          ? 'Telafi taslağı onay kuyruğuna alındı. Yayınlamadan müşteri görmez.'
          : 'Telafi teklifi gönderildi. Müşteri tür ve miktar seçecek.',
      },
      { legacySpread: true }
    );
  }
);
