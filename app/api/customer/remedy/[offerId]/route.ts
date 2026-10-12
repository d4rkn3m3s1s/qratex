export const dynamic = 'force-dynamic';

/**
 * Müşteri: telafi teklifini görüntüle (GET), tür/miktar seçip kabul et (PATCH).
 *
 * P0-22 / D12: Kabulde seçim teklifin KENDİ seçenek listesine (allowlist) karşı doğrulanır;
 * eskiden `{selectedType:'discount', selectedValue:'100'}` gibi teklifte olmayan bir değer
 * 200 ile kaydedilip "%100 indirim kabul edildi" ekranı üretilebiliyordu. Kabulde seçimin
 * anlık görüntüsü (tür/etiket/birim/değer) yazılır; durum geçişi + olay + bayi bildirimi tek tx.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { acceptRemedyOffer, describeRemedyOffer, isRemedyExpired, isRemedyOfferError } from '@/lib/remedy-offer-service';

const paramsSchema = z.object({ offerId: z.string().min(1).max(64) });

const patchSchema = z.object({
  selectedType: z.string({ required_error: 'Telafi türü seçin.' }).trim().min(1, 'Telafi türü seçin.').max(32),
  selectedValue: z
    .union([z.string().trim().min(1, 'Miktar seçin.').max(16), z.number()], {
      errorMap: () => ({ message: 'Miktar seçin.' }),
    }),
});

/** Müşteriye görünmeyen durumlar: varlıkları da sızdırılmaz (404). */
const HIDDEN_FROM_CUSTOMER = new Set(['awaiting_dealer_approval', 'rejected']);

export const GET = defineRoute(
  {
    name: 'customer.remedy.get',
    roles: ['CUSTOMER', 'ADMIN'],
    rateLimit: 'read',
    params: paramsSchema,
  },
  async ({ params, user }) => {
    const offer = await prisma.remedyOffer.findUnique({
      where: { id: params.offerId },
      include: {
        feedback: { select: { id: true, rating: true, text: true, createdAt: true, deletedAt: true } },
        consumptionReview: { select: { id: true, consumptionId: true, rating: true, text: true, createdAt: true, deletedAt: true } },
        dealer: { select: { id: true, name: true, businessName: true } },
      },
    });

    if (!offer) throw new ApiError('NOT_FOUND', 'Telafi teklifi bulunamadı.');
    if (offer.userId !== user.id && user.role !== 'ADMIN') {
      throw new ApiError('FORBIDDEN', 'Bu teklifi görüntüleme yetkiniz yok.');
    }
    if (HIDDEN_FROM_CUSTOMER.has(offer.status) && user.role !== 'ADMIN') {
      throw new ApiError('NOT_FOUND', 'Bu teklif henüz aktif değil.');
    }

    // Kaynağı moderasyonla kaldırılmış bekleyen teklif kabul edilemez (acceptRemedyOffer);
    // seçim formunu açıp onayda hata vermek yerine baştan açıklamalı 404.
    const sourceRemoved = !!(offer.feedback?.deletedAt || offer.consumptionReview?.deletedAt);
    if (offer.status === 'pending' && sourceRemoved && user.role !== 'ADMIN') {
      throw new ApiError('NOT_FOUND', 'Bu telafinin bağlı olduğu yorum kaldırıldı.');
    }

    const { options, selection, selectionLabel } = describeRemedyOffer(offer);
    const strip = <T extends { deletedAt: Date | null }>(src: T | null) => {
      if (!src || src.deletedAt) return null;
      const { deletedAt: _deletedAt, ...rest } = src;
      return rest;
    };
    // Süresi geçmiş ama bakım işi henüz kapatmamış teklif müşteriye "süresi doldu" görünür.
    const effectiveStatus =
      offer.status === 'pending' && isRemedyExpired(offer.expiresAt, new Date()) ? 'expired' : offer.status;
    const base = {
      id: offer.id,
      message: offer.message,
      status: effectiveStatus,
      expiresAt: offer.expiresAt,
      dealer: offer.dealer,
      feedbackId: offer.feedbackId,
      consumptionReviewId: offer.consumptionReviewId,
      feedback: strip(offer.feedback),
      consumptionReview: strip(offer.consumptionReview),
      createdAt: offer.createdAt,
    };

    if (effectiveStatus !== 'pending') {
      return ok(
        {
          offer: {
            ...base,
            selectedType: offer.selectedType,
            selectedValue: offer.selectedValue,
            selection,
            selectionLabel,
            acceptedAt: offer.acceptedAt,
          },
          alreadyProcessed: true,
        },
        { legacySpread: true }
      );
    }

    // Normalize edilmiş seçenekler: istemci yalnız sunucunun kabul edeceği değerleri görür
    // (dizi olmayan Json alanı istemcide `options.find` çökmesine yol açmaz).
    return ok({ offer: { ...base, options } }, { legacySpread: true });
  }
);

export const PATCH = defineRoute(
  {
    name: 'customer.remedy.accept',
    // Puan basabilen kabul yalnız müşteriye (mimari-api B1/B2: puan basan uçlar ['CUSTOMER']).
    // Yönetici görüntüleyebilir (GET) ama teklif sahibi olmadığı için kabul edemez.
    roles: ['CUSTOMER'],
    rateLimit: 'mutation',
    params: paramsSchema,
    schema: z.unknown(),
  },
  async ({ params, user, body: rawBody }) => {
    const parsed = patchSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ApiError('VALIDATION', parsed.error.issues[0]?.message || 'Telafi türü ve miktarı seçin.', {
        details: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    try {
      const result = await acceptRemedyOffer({
        offerId: params.offerId,
        userId: user.id,
        selectedType: parsed.data.selectedType,
        selectedValue: parsed.data.selectedValue,
      });
      return ok(
        {
          offer: {
            id: result.offerId,
            status: result.status,
            selectedType: result.selection.type,
            selectedValue: String(result.selection.value),
            selection: result.selection,
            acceptedAt: result.acceptedAt,
            // Puan türünde hesaba geçen miktar (diğer türlerde null — teslim bayide).
            creditedPoints: result.creditedPoints,
          },
        },
        { legacySpread: true }
      );
    } catch (err) {
      if (isRemedyOfferError(err)) throw new ApiError(err.code, err.message, { status: err.status });
      throw err;
    }
  }
);
