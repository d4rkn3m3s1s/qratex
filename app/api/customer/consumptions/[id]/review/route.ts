import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkIdempotency, storeIdempotency } from '@/lib/idempotency';
import { createConsumptionReviewSchema } from '@/lib/validations';
import { getConsumptionReviewReward, getPointsMatrix } from '@/lib/points-rules';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { analyzeWithFallback } from '@/lib/ai-engine';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

async function analyzeAndPersistConsumptionReview(params: {
  reviewId: string;
  dealerId: string;
  customerId: string;
  rating: number;
  text?: string;
}) {
  const text = params.text?.trim();
  if (!text || text.length < 5) {
    const sentimentFromRating = params.rating >= 4 ? 'positive' : params.rating >= 3 ? 'neutral' : 'negative';
    await prisma.analyticsEvent.create({
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
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return;
  }

  const analysis = await analyzeWithFallback(text, { dealerId: params.dealerId });
  await prisma.analyticsEvent.create({
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
  });
}

/**
 * POST /api/customer/consumptions/[id]/review
 * Tüketime yorum/puan ekle
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const idemCheck = await checkIdempotency(request, 'consumption-review');
    if ('error' in idemCheck) return idemCheck.error;
    if (idemCheck.cached) return idemCheck.response;
    const idemKey = idemCheck.key;

    const session = await getServerSession(authOptions);
    const { id } = await params;
    
    if (!session?.user || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const body = await request.json();
    const validatedData = createConsumptionReviewSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const { rating, text, dimensions } = validatedData.data;

    // Tüketim kaydını bul
    const consumption = await prisma.consumption.findUnique({
      where: { id },
      include: {
        review: true,
        dealer: {
          select: {
            id: true,
            name: true,
            businessName: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!consumption) {
      return NextResponse.json(
        { error: 'Tüketim kaydı bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Sadece kendi tüketimine yorum yapabilir
    if (consumption.customerId !== session.user.id) {
      return NextResponse.json(
        { error: 'Bu tüketime yorum yapma yetkiniz yok' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Zaten yorum var mı?
    if (consumption.review) {
      return NextResponse.json(
        { error: 'Bu tüketim için zaten yorum yapılmış' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Kullanıcıya verilecek puanı hesapla (gamification)
    const matrix = await getPointsMatrix();
    const reward = getConsumptionReviewReward(text, matrix);
    const pointsEarned = reward.points;
    const xpEarned = reward.xp;

    // Yorum oluşturma + puan kredisi + bildirimler TEK transaction içinde.
    // `consumptionReview.consumptionId` UNIQUE olduğundan, iki eşzamanlı istekten
    // yalnızca biri create'i geçer; diğeri P2002 ile rollback olur ve ASLA puan
    // kredisi almaz (önceki kod create ile krediyi ayrı yürütüyordu → çift puan).
    let review;
    try {
      review = await prisma.$transaction(async (tx) => {
        const created = await tx.consumptionReview.create({
          data: {
            consumptionId: consumption.id,
            customerId: session.user.id,
            rating,
            text: text || undefined,
            dimensions: dimensions || undefined,
          },
        });

        await creditPointsAndXp(tx, {
          userId: session.user.id,
          points: pointsEarned,
          xp: xpEarned,
        });

        await tx.notification.create({
          data: {
            userId: session.user.id,
            title: 'Yorum için teşekkürler!',
            message: `${pointsEarned} puan kazandınız!`,
            type: 'success',
            data: { reviewId: created.id, pointsEarned, xpEarned },
          },
        });

        await tx.notification.create({
          data: {
            userId: consumption.dealerId,
            title: 'Yeni Müşteri Yorumu',
            message: `${consumption.product?.name || 'Bir ürün'} için ${rating} yıldızlı yorum aldınız.`,
            type: 'info',
            data: { reviewId: created.id, consumptionId: consumption.id, rating },
          },
        });

        return created;
      });
    } catch (txError) {
      if (
        txError instanceof Prisma.PrismaClientKnownRequestError &&
        txError.code === 'P2002'
      ) {
        return NextResponse.json(
          { error: 'Bu tüketim için zaten yorum yapılmış' },
          { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      throw txError;
    }

    // Yorum geldiği anda analiz + segment sinyallerini DB'ye kaydet
    analyzeAndPersistConsumptionReview({
      reviewId: review.id,
      dealerId: consumption.dealerId,
      customerId: session.user.id,
      rating,
      text: text || undefined,
    }).catch((err) => {
      console.error('Consumption review analysis failed:', err);
    });

    const resBody = {
      success: true,
      message: 'Yorumunuz kaydedildi!',
      review,
      rewards: { points: pointsEarned, xp: xpEarned },
    };
    if (idemKey) await storeIdempotency(idemKey, 'consumption-review', 200, resBody);
    return NextResponse.json(resBody, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error creating review:', error);
    return NextResponse.json(
      { error: 'Yorum kaydedilemedi' },
        { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
      );
  }
}

/**
 * PUT /api/customer/consumptions/[id]/review
 * Yorumu güncelle
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;
    
    if (!session?.user || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const body = await request.json();
    const validatedData = createConsumptionReviewSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const { rating, text, dimensions } = validatedData.data;

    // Mevcut yorumu bul
    const existingReview = await prisma.consumptionReview.findFirst({
      where: {
        consumptionId: id,
        customerId: session.user.id,
      },
      include: {
        consumption: {
          select: {
            dealerId: true,
          },
        },
      },
    });

    if (!existingReview) {
      return NextResponse.json(
        { error: 'Yorum bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Güncelle
    const review = await prisma.consumptionReview.update({
      where: { id: existingReview.id },
      data: {
        rating,
        text: text || undefined,
        dimensions: dimensions || undefined,
      },
    });

    // Güncellemede de anlık analiz sinyalini yenile
    analyzeAndPersistConsumptionReview({
      reviewId: review.id,
      dealerId: existingReview.consumption.dealerId,
      customerId: session.user.id,
      rating,
      text: text || undefined,
    }).catch((err) => {
      console.error('Consumption review re-analysis failed:', err);
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Yorumunuz güncellendi',
        review,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error updating review:', error);
    return NextResponse.json(
      { error: 'Yorum güncellenemedi' },
        { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
      );
  }
}
