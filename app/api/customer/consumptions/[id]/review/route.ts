/**
 * Tüketim yorumu — oluştur (POST) ve düzenle (PUT, PATCH semantiği).
 *
 * Seslerim (/customer/me/voices) detay çekmecesinin yazma ucu. Değişmezler:
 *  - Varsayılan reddet: yalnız CUSTOMER; zod gövde; hız sınırı; POST `Idempotency-Key` korumalı.
 *  - Puan yalnız `mintPoints` ile (lib/economy): tek seferlik defter anahtarı
 *    `consumption_review:<consumptionId>`, `feedback` tavanı, `points_credited` görünürlüğü.
 *    `consumptionReview.consumptionId` UNIQUE → yarışan ikinci istek P2002 ile geri alınır,
 *    kredi asla iki kez yazılmaz.
 *  - Ödül eşiği ve miktarı sunucudan (admin matrisi); istemcinin vaadine güvenilmez.
 *  - AI analizi, karakter rozeti ve rozet işleri `after()` içinde (serverless'ta yarıda kesilmez).
 *  - PUT: yalnız gönderilen alanlar değişir; `text: null` / `dimensions: null` = SİL (KVKK).
 *    Metin değişmediyse AI yeniden çağrılmaz. Düzenleme yeni puan basmaz.
 *  - Karakter rozeti: bir yorum EN FAZLA BİR KEZ sınıflandırılır (`CHARACTER_MARK_EVENT`);
 *    düzenleme/sil-yeniden-yaz aynı yorumu başka kategoriye taşıyıp rozet açtıramaz.
 */
import { after } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { mintPoints } from '@/lib/economy';
import { getConsumptionReviewReward, getPointsMatrix } from '@/lib/points-rules';
import { analyzeWithFallback } from '@/lib/ai-engine';
import { INPUT_LIMITS } from '@/lib/input-limits';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ id: z.string().min(1).max(64) });

const dim = z.number({ invalid_type_error: 'Boyut puanı 1-5 arasında olmalı.' }).int().min(1, 'Boyut puanı 1-5 arasında olmalı.').max(5, 'Boyut puanı 1-5 arasında olmalı.');
const dimensionsSchema = z
  .object({
    taste: dim.optional(),
    service: dim.optional(),
    ambiance: dim.optional(),
    value: dim.optional(),
    cleanliness: dim.optional(),
  })
  .strict();

const ratingSchema = z
  .number({ required_error: 'Lütfen 1-5 arasında bir puan seçin.', invalid_type_error: 'Lütfen 1-5 arasında bir puan seçin.' })
  .int('Lütfen 1-5 arasında bir puan seçin.')
  .min(1, 'Lütfen 1-5 arasında bir puan seçin.')
  .max(5, 'Lütfen 1-5 arasında bir puan seçin.');

const textSchema = z
  .string({ invalid_type_error: 'Yorum metin olmalı.' })
  .max(INPUT_LIMITS.feedbackText, `Yorum en fazla ${INPUT_LIMITS.feedbackText} karakter olabilir.`);

const createSchema = z.object({
  rating: ratingSchema,
  text: textSchema.optional(),
  dimensions: dimensionsSchema.optional(),
});

const updateSchema = z
  .object({
    rating: ratingSchema.optional(),
    /** `null` ya da boş metin = yorumu sil. */
    text: textSchema.nullable().optional(),
    /** `null` = tüm boyut puanlarını sil. */
    dimensions: dimensionsSchema.nullable().optional(),
  })
  .refine((v) => v.rating !== undefined || v.text !== undefined || v.dimensions !== undefined, {
    message: 'Değiştirilecek bir alan gönderin.',
  });

const cleanText = (t: string | null | undefined): string | null => {
  const v = typeof t === 'string' ? t.trim() : '';
  return v ? v : null;
};

const cleanDims = (d: Record<string, number | undefined> | null | undefined): Prisma.InputJsonValue | null => {
  if (!d) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(d)) if (typeof v === 'number') out[k] = v;
  return Object.keys(out).length ? out : null;
};

/**
 * Yorum sinyallerini (duygu, kaybetme riski) yazar. Kısa/boş metinde AI çağrılmaz; puandan
 * duygu türetilir ve metinden türemiş churn sinyali TEMİZLENİR (metin silindiyse eski
 * sinyal kalmasın).
 */
async function analyzeAndPersistConsumptionReview(params: {
  reviewId: string;
  dealerId: string;
  customerId: string;
  rating: number;
  text: string | null;
}) {
  const text = params.text?.trim();
  const now = new Date();

  if (!text || text.length < 5) {
    const sentimentFromRating = params.rating >= 4 ? 'positive' : params.rating >= 3 ? 'neutral' : 'negative';
    await prisma.consumptionReview
      .update({ where: { id: params.reviewId }, data: { sentiment: sentimentFromRating, churnRisk: null, analyzedAt: now } })
      .catch(() => {});
    await prisma.analyticsEvent
      .create({
        data: {
          userId: params.customerId,
          event: 'consumption_review_analyzed',
          category: 'ai',
          data: {
            reviewId: params.reviewId,
            dealerId: params.dealerId,
            sentiment: sentimentFromRating,
            source: 'rating_fallback',
            textLength: text?.length ?? 0,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});
    return;
  }

  const analysis = await analyzeWithFallback(text, { dealerId: params.dealerId });
  await prisma.consumptionReview
    .update({
      where: { id: params.reviewId },
      data: { sentiment: analysis.sentiment.label, churnRisk: analysis.churnRisk ?? null, analyzedAt: now },
    })
    .catch(() => {});
  await prisma.analyticsEvent
    .create({
      data: {
        userId: params.customerId,
        event: 'consumption_review_analyzed',
        category: 'ai',
        data: {
          reviewId: params.reviewId,
          dealerId: params.dealerId,
          sentiment: analysis.sentiment.label,
          intent: analysis.intent?.label ?? null,
          intentScore: analysis.intent?.score ?? null,
          urgency: analysis.urgency ?? null,
          churnRisk: analysis.churnRisk ?? null,
          topics: analysis.topics ?? [],
          themes: analysis.themes ?? [],
          model: analysis.modelUsed ?? null,
          version: analysis.version ?? null,
          source: 'ai',
        } as unknown as Prisma.InputJsonValue,
      },
    })
    .catch(() => {});
}

function scheduleAnalysis(input: Parameters<typeof analyzeAndPersistConsumptionReview>[0]) {
  after(() =>
    analyzeAndPersistConsumptionReview(input).catch((err) => {
      console.error('[consumption-review] analiz başarısız:', err);
    })
  );
}

/**
 * Karakter rozeti "bu yorum sınıflandırıldı" işareti. Karakter barı yorum BAŞINA bir kez
 * sayılmalı: işaret yoksa PUT "metni sil (kategori temizlenir) → yeni üslupta yeniden yaz"
 * döngüsüyle AYNI yorumları kategoriden kategoriye taşıyıp her kategorinin karakterini (ve
 * rozet ödül puanını) açtırabiliyordu. İşaret yalnız yorum id'si taşır (metin değil → KVKK
 * silmesiyle çelişmez).
 */
const CHARACTER_MARK_EVENT = 'consumption_review_character_classified';
const CHARACTER_MIN_TEXT = 8;

const characterEligible = (text: string | null | undefined): text is string =>
  typeof text === 'string' && text.trim().length >= CHARACTER_MIN_TEXT;

function characterMarkData(userId: string, reviewId: string, reason: 'create' | 'edit' | 'text_deleted') {
  return {
    userId,
    event: CHARACTER_MARK_EVENT,
    category: 'character',
    data: { reviewId, reason } as Prisma.InputJsonValue,
  };
}

/** İşaret var mı? Okuma hatasında fail-closed: "işlenmiş" say (yeniden sınıflandırma yok). */
async function wasCharacterProcessed(userId: string, reviewId: string): Promise<boolean> {
  try {
    const row = await prisma.analyticsEvent.findFirst({
      where: { userId, event: CHARACTER_MARK_EVENT, data: { path: ['reviewId'], equals: reviewId } },
      select: { id: true },
    });
    return !!row;
  } catch {
    return true;
  }
}

async function markCharacterProcessed(
  userId: string,
  reviewId: string,
  reason: 'create' | 'edit'
): Promise<boolean> {
  try {
    await prisma.analyticsEvent.create({ data: characterMarkData(userId, reviewId, reason) });
    return true;
  } catch {
    return false;
  }
}

function scheduleCharacterBadge(userId: string, reviewId: string, text: string | null) {
  if (!characterEligible(text)) return;
  after(() =>
    import('@/lib/character-badges')
      .then((m) => m.processConsumptionReviewForCharacterBadge(userId, reviewId, text))
      .catch(() => {})
  );
}

/**
 * POST — yorum + ödül tek transaction'da. Yanıt: `{ review, rewards: { points, xp, requested,
 * capped, leveledUp, level } }` (kutlama anı gerçek krediye göre).
 */
export const POST = defineRoute(
  {
    name: 'customer.consumption.review.create',
    roles: ['CUSTOMER'],
    rateLimit: 'mutation',
    idempotent: true,
    params: paramsSchema,
    schema: createSchema,
  },
  async ({ params, body, user }) => {
    const consumption = await prisma.consumption.findFirst({
      where: { id: params.id, customerId: user.id },
      select: {
        id: true,
        dealerId: true,
        product: { select: { name: true } },
        review: { select: { id: true } },
      },
    });
    if (!consumption) throw new ApiError('NOT_FOUND', 'Tüketim kaydı bulunamadı.');
    if (consumption.review) throw new ApiError('CONFLICT', 'Bu tüketim için zaten yorum yapılmış.');

    const text = cleanText(body.text);
    const dimensions = cleanDims(body.dimensions);
    const matrix = await getPointsMatrix();
    const reward = getConsumptionReviewReward(text, matrix);

    let result: {
      review: { id: string; rating: number; text: string | null; createdAt: Date };
      credited: number;
      xp: number;
      capped: boolean;
      leveledUp: boolean;
      level: number;
    };
    try {
      result = await prisma.$transaction(async (tx) => {
        const created = await tx.consumptionReview.create({
          data: {
            consumptionId: consumption.id,
            customerId: user.id,
            rating: body.rating,
            text,
            ...(dimensions ? { dimensions } : {}),
          },
          select: { id: true, rating: true, text: true, createdAt: true },
        });

        const minted = await mintPoints(tx, {
          userId: user.id,
          points: reward.points,
          xp: reward.xp,
          source: 'review',
          sourceId: created.id,
          idempotencyKey: `consumption_review:${consumption.id}`,
          capCategory: 'feedback',
          meta: { consumptionId: consumption.id, dealerId: consumption.dealerId, detailed: !!text && text.length >= matrix.consumptionReview.longTextThreshold },
        });

        // Defter anahtarı daha önce işlenmişse (ör. yorum satırı sert silinip yeniden yazıldı)
        // mintPoints İLK kredinin tutarını döndürür; bu istekte kredi YOK → "kazandın" denmez.
        const credited = minted.duplicate ? 0 : minted.credited;
        const xpCredited = minted.duplicate ? 0 : minted.xpCredited;
        const leveledUp = !minted.duplicate && minted.isLevelUp;

        await tx.notification.create({
          data: {
            userId: user.id,
            title: leveledUp ? `Seviye atladın! Seviye ${minted.level}` : 'Yorumun için teşekkürler!',
            message:
              credited > 0
                ? leveledUp
                  ? `${credited} puan kazandın ve artık Seviye ${minted.level} oldun.`
                  : `${credited} puan kazandın.`
                : minted.duplicate
                  ? 'Yorumun işletmeye ulaştı. Bu ziyaret için yorum puanı daha önce verilmişti.'
                  : 'Yorumun işletmeye ulaştı. Bugünkü yorum puanı sınırına ulaştığın için puan eklenmedi.',
            type: 'success',
            data: {
              reviewId: created.id,
              consumptionId: consumption.id,
              pointsEarned: credited,
              xpEarned: xpCredited,
              leveledUp,
              level: minted.level,
              ctaPath: `/customer/me/voices?id=cs-${consumption.id}`,
            },
          },
        });

        await tx.notification.create({
          data: {
            userId: consumption.dealerId,
            title: 'Yeni Müşteri Yorumu',
            message: `${consumption.product?.name || 'Bir ürün'} için ${body.rating} yıldızlı yorum aldınız.`,
            type: 'info',
            data: { reviewId: created.id, consumptionId: consumption.id, rating: body.rating },
          },
        });

        return {
          review: created,
          credited,
          xp: xpCredited,
          capped: minted.capped,
          leveledUp,
          level: minted.level,
        };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError('CONFLICT', 'Bu tüketim için zaten yorum yapılmış.');
      }
      throw err;
    }

    const uid = user.id;
    const rid = result.review.id;
    scheduleAnalysis({ reviewId: rid, dealerId: consumption.dealerId, customerId: uid, rating: body.rating, text });
    if (characterEligible(text)) {
      // İlk sınıflandırma meşru: işaret yazılamasa da çalışır (silme yolu işareti ayrıca yazar).
      await markCharacterProcessed(uid, rid, 'create');
      scheduleCharacterBadge(uid, rid, text);
    }
    // Sürpriz + davranışsal rozetler ve davet nitelendirmesi (hepsi idempotent).
    after(() => import('@/lib/surprise-badges').then((m) => m.awardEligibleSurpriseBadges(uid)).catch(() => {}));
    after(() => import('@/lib/activity-badges').then((m) => m.awardActivityBadges(uid)).catch(() => {}));
    after(() => import('@/lib/referral').then((m) => m.maybeQualifyReferral(uid)).catch(() => {}));

    return ok(
      {
        message: 'Yorumun kaydedildi.',
        review: result.review,
        rewards: {
          points: result.credited,
          xp: result.xp,
          requested: reward.points,
          capped: result.capped,
          leveledUp: result.leveledUp,
          level: result.level,
        },
      },
      { status: 201, legacySpread: true }
    );
  }
);

/**
 * PUT — düzenleme (PATCH semantiği). İşletme yanıtladıktan sonra düzenlenirse işletmeye
 * "yorum güncellendi" bildirimi gider (yanıt bağlamsız kalmasın).
 */
export const PUT = defineRoute(
  {
    name: 'customer.consumption.review.update',
    roles: ['CUSTOMER'],
    // Her metin değişikliği bir AI analizi tetikleyebilir → kullanıcı başına saatlik sınır.
    rateLimit: { max: 10, windowMs: 60 * 60_000, by: 'user' },
    params: paramsSchema,
    schema: updateSchema,
  },
  async ({ params, body, user }) => {
    const existing = await prisma.consumptionReview.findFirst({
      where: { consumptionId: params.id, customerId: user.id, deletedAt: null },
      select: {
        id: true,
        rating: true,
        text: true,
        characterCategory: true,
        dealerRepliedAt: true,
        consumption: { select: { dealerId: true } },
      },
    });
    if (!existing) throw new ApiError('NOT_FOUND', 'Yorum bulunamadı.');

    const data: Prisma.ConsumptionReviewUpdateInput = {};
    if (body.rating !== undefined) data.rating = body.rating;
    const nextText = body.text === undefined ? existing.text : cleanText(body.text);
    const textChanged = body.text !== undefined && nextText !== (existing.text?.trim() || null);
    if (body.text !== undefined) data.text = nextText;
    if (body.dimensions !== undefined) {
      const d = cleanDims(body.dimensions);
      data.dimensions = d === null ? Prisma.DbNull : d;
    }
    // Metin silinirse metinden türemiş üslup kategorisi de silinir (karakter barı yalnız metinli yorumu sayar).
    if (textChanged && !nextText) data.characterCategory = null;
    // Sınıflandırılmış bir yorumun kategorisi temizleniyorsa "işlendi" işareti AYNI tx'te yazılır:
    // metin sonradan yeniden eklendiğinde yorum ikinci kez sınıflandırılıp başka kategoriye
    // sayılamaz (rozet ilerlemesi yorum başına bir kez). İşaret yazılamazsa silme de olmaz.
    const clearsCategory = textChanged && !nextText && !!existing.characterCategory;

    const updateArgs = {
      where: { id: existing.id },
      data,
      select: { id: true, rating: true, text: true, dimensions: true, updatedAt: true, dealerRepliedAt: true },
    } satisfies Prisma.ConsumptionReviewUpdateArgs;
    const updated = clearsCategory
      ? await prisma.$transaction(async (tx) => {
          await tx.analyticsEvent.create({ data: characterMarkData(user.id, existing.id, 'text_deleted') });
          return tx.consumptionReview.update(updateArgs);
        })
      : await prisma.consumptionReview.update(updateArgs);

    const ratingChanged = body.rating !== undefined && body.rating !== existing.rating;
    if (textChanged || ratingChanged) {
      // Metin aynıysa AI çağrılmaz; yalnız puan değiştiyse ve metin kısa/boşsa puandan türetilir.
      if (textChanged || !nextText || nextText.length < 5) {
        scheduleAnalysis({
          reviewId: existing.id,
          dealerId: existing.consumption.dealerId,
          customerId: user.id,
          rating: updated.rating,
          text: nextText,
        });
      }
    }
    if (textChanged && characterEligible(nextText) && !existing.characterCategory) {
      // Hatırlatma akışı ("puan verdin ama yorum boş") PUT ile metin ekletiyor → karakter barı saysın.
      // YALNIZ hiç sınıflandırılmamış yorum için: sil → yeniden yaz döngüsü aynı yorumu ikinci
      // kez saydıramaz. İşaret yazılamazsa sınıflandırma da yapılmaz (fail-closed).
      if (
        !(await wasCharacterProcessed(user.id, existing.id)) &&
        (await markCharacterProcessed(user.id, existing.id, 'edit'))
      ) {
        scheduleCharacterBadge(user.id, existing.id, nextText);
      }
    }

    if ((textChanged || ratingChanged) && existing.dealerRepliedAt) {
      await prisma.notification
        .create({
          data: {
            userId: existing.consumption.dealerId,
            title: 'Müşteri yorumunu güncelledi',
            message: 'Yanıtladığınız bir tüketim yorumu müşteri tarafından düzenlendi.',
            type: 'info',
            data: { reviewId: existing.id, consumptionId: params.id, type: 'review_edited' },
          },
        })
        .catch(() => {});
    }

    return ok({ message: 'Yorumun güncellendi.', review: updated }, { legacySpread: true });
  }
);
