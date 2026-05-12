import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { createConsumptionSchema } from '@/lib/validations';

// Rate limit için basit in-memory cache (production'da Redis kullanılmalı)

export const dynamic = 'force-dynamic';

const rateLimitCache = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60000; // 1 dakika
const RATE_LIMIT_MAX = 5; // 1 dakikada max 5 tüketim aynı karta

/**
 * GET /api/dealer/consumptions
 * Bayi'nin kaydettiği tüketimleri listele
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const skip = (page - 1) * pageSize;

    const [consumptions, total] = await Promise.all([
      prisma.consumption.findMany({
        where: { dealerId: session.user.id },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          card: {
            select: {
              id: true,
              token: true,
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              category: {
                select: {
                  id: true,
                  name: true,
                  icon: true,
                },
              },
            },
          },
          review: {
            select: {
              id: true,
              rating: true,
              text: true,
            },
          },
        },
      }),
      prisma.consumption.count({ where: { dealerId: session.user.id } }),
    ]);

    return NextResponse.json({
      success: true,
      items: consumptions,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('Error fetching consumptions:', error);
    return NextResponse.json(
      { error: 'Tüketimler getirilemedi' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dealer/consumptions
 * Yeni tüketim kaydı oluştur
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await request.json();
    const validatedData = createConsumptionSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message },
        { status: 400 }
      );
    }

    const { cardToken, productId, amount, note } = validatedData.data;

    // Kartı bul
    const card = await prisma.physicalCard.findUnique({
      where: { token: cardToken },
      select: {
        id: true,
        status: true,
        customerId: true,
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!card) {
      return NextResponse.json(
        { error: 'Kart bulunamadı' },
        { status: 404 }
      );
    }

    if (card.status === 'BLOCKED') {
      return NextResponse.json(
        { error: 'Bu kart bloklanmış' },
        { status: 403 }
      );
    }

    if (card.status === 'UNUSED' || !card.customerId) {
      return NextResponse.json(
        { error: 'Bu kart henüz aktive edilmemiş' },
        { status: 400 }
      );
    }

    // Rate limit kontrolü
    const rateLimitKey = `${card.id}_${session.user.id}`;
    const lastRequest = rateLimitCache.get(rateLimitKey) || 0;
    const now = Date.now();

    if (now - lastRequest < RATE_LIMIT_WINDOW / RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: 'Çok hızlı! Lütfen biraz bekleyin.' },
        { status: 429 }
      );
    }

    rateLimitCache.set(rateLimitKey, now);

    // Ürün kontrolü (opsiyonel)
    let product = null;
    if (productId) {
      product = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          price: true,
          dealerId: true,
        },
      });

      if (!product) {
        return NextResponse.json(
          { error: 'Ürün bulunamadı' },
          { status: 404 }
        );
      }

      // Ürün bu bayiye ait mi veya global mı?
      if (product.dealerId && product.dealerId !== session.user.id) {
        return NextResponse.json(
          { error: 'Bu ürüne erişim yetkiniz yok' },
          { status: 403 }
        );
      }
    }

    // Tüketim kaydı oluştur
    const consumption = await prisma.consumption.create({
      data: {
        cardId: card.id,
        customerId: card.customerId,
        dealerId: session.user.id,
        productId: productId || null,
        amount: amount || product?.price || null,
        note: note || null,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
    });

    // Audit log
    await prisma.cardAuditLog.create({
      data: {
        cardId: card.id,
        userId: session.user.id,
        action: 'CONSUMPTION_ADDED',
        metadata: {
          consumptionId: consumption.id,
          productId,
          amount: consumption.amount,
        },
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    // Müşteriye bildirim gönder (opsiyonel)
    await prisma.notification.create({
      data: {
        userId: card.customerId,
        title: 'Yeni Tüketim Kaydı',
        message: product
          ? `${product.name} tüketiminiz kaydedildi. Yorum bırakmayı unutmayın!`
          : 'Yeni bir tüketim kaydınız oluşturuldu. Yorum bırakmayı unutmayın!',
        type: 'info',
        data: {
          consumptionId: consumption.id,
          type: 'consumption_added',
        },
      },
    });

    // --- SQUAD PASSIVE POINTS LOGIC ---
    // Calculate an arbitrary base XP for scanning/consuming
    const baseXP = amount ? Math.floor(amount * 10) : 50;
    const passivePoints = Math.floor(baseXP * 0.05);

    if (passivePoints > 0) {
      const squadMembership = await prisma.squadMember.findFirst({
        where: { userId: card.customerId }
      });

      if (squadMembership) {
        await prisma.$transaction([
          prisma.squad.update({
            where: { id: squadMembership.squadId },
            data: { totalPoints: { increment: passivePoints } }
          }),
          prisma.user.update({
            where: { id: card.customerId },
            data: { points: { increment: baseXP } } // Primary user gets full XP
          })
        ]);
      } else {
        // Normal XP without squad
        await prisma.user.update({
          where: { id: card.customerId },
          data: { points: { increment: baseXP } }
        });
      }
    }
    // ----------------------------------

    return NextResponse.json({
      success: true,
      message: 'Tüketim kaydı oluşturuldu',
      consumption,
    });
  } catch (error) {
    console.error('Error creating consumption:', error);
    return NextResponse.json(
      { error: 'Tüketim kaydı oluşturulamadı' },
      { status: 500 }
    );
  }
}
