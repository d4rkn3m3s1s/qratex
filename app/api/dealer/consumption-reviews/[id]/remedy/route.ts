export const dynamic = 'force-dynamic';

/**
 * 1-tık telafi (tüketim yorumu): RemedyOffer oluşturur. QR geri bildirimi telafisiyle aynı
 * servis (`lib/remedy-offer-service`): geçersiz gövdede 400 (onay kuyruğu bypass'ı yok),
 * açık/kabul edilmiş teklif varken 409, seçenekler şablon allowlist'inin alt kümesi.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getRemedyOptions, restrictRemedyOptionsToAllowlist } from '@/lib/remedy-options';
import {
  createRemedyOffer,
  isRemedyOfferError,
  resolveRemedyMode,
  parseRemedyCreateBody,
  DEFAULT_REMEDY_MESSAGE,
} from '@/lib/remedy-offer-service';

const paramsSchema = z.object({ id: z.string().min(1).max(64) });

export const POST = defineRoute(
  {
    name: 'dealer.consumption-reviews.remedy.create',
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
    const reviewId = params.id;
    const review = await prisma.consumptionReview.findUnique({
      where: { id: reviewId },
      select: { id: true, customerId: true, deletedAt: true, consumption: { select: { dealerId: true } } },
    });
    if (!review || review.deletedAt) throw new ApiError('NOT_FOUND', 'Tüketim yorumu bulunamadı.');
    if (user.role === 'DEALER' && review.consumption.dealerId !== user.id) {
      throw new ApiError('FORBIDDEN', 'Bu yoruma telafi başlatma yetkiniz yok.');
    }

    const dealerId = review.consumption.dealerId;
    // Tüketim yorumları QR koda bağlı değil → işletme geneli telafi şablonları.
    const allowed = await getRemedyOptions(dealerId, null);
    let options = allowed;
    if (body.options !== undefined) {
      const restricted = restrictRemedyOptionsToAllowlist(body.options, allowed);
      if (!restricted.ok) throw new ApiError('VALIDATION', restricted.reason);
      options = restricted.options;
    }

    let result;
    try {
      result = await createRemedyOffer({
        source: { kind: 'consumption_review', consumptionReviewId: reviewId },
        dealerId,
        userId: review.customerId,
        message: body.message || DEFAULT_REMEDY_MESSAGE,
        mode: resolveRemedyMode(body),
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
            consumptionReviewId: reviewId,
            customerId: review.customerId,
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
        consumptionReviewId: reviewId,
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
