import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createConsumptionReviewSchema } from '@/lib/validations';

/**
 * POST /api/customer/consumptions/[id]/review
 * Tüketime yorum/puan ekle
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;
    
    if (!session?.user || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Yetkisiz erişim' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createConsumptionReviewSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
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
        { status: 404 }
      );
    }

    // Sadece kendi tüketimine yorum yapabilir
    if (consumption.customerId !== session.user.id) {
      return NextResponse.json(
        { error: 'Bu tüketime yorum yapma yetkiniz yok' },
        { status: 403 }
      );
    }

    // Zaten yorum var mı?
    if (consumption.review) {
      return NextResponse.json(
        { error: 'Bu tüketim için zaten yorum yapılmış' },
        { status: 400 }
      );
    }

    // Yorum oluştur
    const review = await prisma.consumptionReview.create({
      data: {
        consumptionId: consumption.id,
        customerId: session.user.id,
        rating,
        text: text || null,
        dimensions: dimensions || null,
      },
    });

    // Kullanıcıya puan ver (gamification)
    const pointsEarned = text && text.length > 50 ? 100 : 50; // Detaylı yorum için daha fazla puan
    const xpEarned = text && text.length > 50 ? 50 : 25;

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        points: { increment: pointsEarned },
        xp: { increment: xpEarned },
      },
    });

    // Bildirim gönder
    await prisma.notification.create({
      data: {
        userId: session.user.id,
        title: 'Yorum için teşekkürler!',
        message: `${pointsEarned} puan kazandınız!`,
        type: 'success',
        data: {
          reviewId: review.id,
          pointsEarned,
          xpEarned,
        },
      },
    });

    // Bayiye de bildirim
    await prisma.notification.create({
      data: {
        userId: consumption.dealerId,
        title: 'Yeni Müşteri Yorumu',
        message: `${consumption.product?.name || 'Bir ürün'} için ${rating} yıldızlı yorum aldınız.`,
        type: 'info',
        data: {
          reviewId: review.id,
          consumptionId: consumption.id,
          rating,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Yorumunuz kaydedildi!',
      review,
      rewards: {
        points: pointsEarned,
        xp: xpEarned,
      },
    });
  } catch (error) {
    console.error('Error creating review:', error);
    return NextResponse.json(
      { error: 'Yorum kaydedilemedi' },
      { status: 500 }
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
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createConsumptionReviewSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
      );
    }

    const { rating, text, dimensions } = validatedData.data;

    // Mevcut yorumu bul
    const existingReview = await prisma.consumptionReview.findFirst({
      where: {
        consumptionId: id,
        customerId: session.user.id,
      },
    });

    if (!existingReview) {
      return NextResponse.json(
        { error: 'Yorum bulunamadı' },
        { status: 404 }
      );
    }

    // Güncelle
    const review = await prisma.consumptionReview.update({
      where: { id: existingReview.id },
      data: {
        rating,
        text: text || null,
        dimensions: dimensions || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Yorumunuz güncellendi',
      review,
    });
  } catch (error) {
    console.error('Error updating review:', error);
    return NextResponse.json(
      { error: 'Yorum güncellenemedi' },
      { status: 500 }
    );
  }
}
