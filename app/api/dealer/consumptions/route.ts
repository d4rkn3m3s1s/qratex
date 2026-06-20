import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { createConsumptionSchema } from '@/lib/validations';
import { isHappyHourLive } from '@/lib/happy-hour-live';
import {
  PRIVATE_NO_STORE_HEADERS,
  clampPageParam,
  clampPageSizeParam,
  paginationSkip,
  responseIfDatabaseUnavailable,
} from '@/lib/api-http';

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
    const page = clampPageParam(searchParams.get('page'));
    const pageSize = clampPageSizeParam(searchParams.get('pageSize'), 20, 100);
    const skip = paginationSkip(page, pageSize);

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
            // Ham müşteri ID'si bayiye sızdırılmaz (gizlilik).
            select: {
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

    const items = consumptions.map((row) => {
      const token = row.card?.token;
      const tokenPublic =
        typeof token === 'string' && token.length > 0 ? token.slice(-4) : '';
      return {
        ...row,
        card: row.card ? { id: row.card.id, token: tokenPublic } : row.card,
      };
    });

    return NextResponse.json(
      {
        success: true,
        items,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching consumptions:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Tüketimler getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
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
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
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
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    if (card.status === 'BLOCKED') {
      return NextResponse.json(
        { error: 'Bu kart bloklanmış' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    if (card.status === 'UNUSED' || !card.customerId) {
      return NextResponse.json(
        { error: 'Bu kart henüz aktive edilmemiş' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Rate limit kontrolü
    const rateLimitKey = `${card.id}_${session.user.id}`;
    const lastRequest = rateLimitCache.get(rateLimitKey) || 0;
    const now = Date.now();

    if (now - lastRequest < RATE_LIMIT_WINDOW / RATE_LIMIT_MAX) {
      const minGapMs = RATE_LIMIT_WINDOW / RATE_LIMIT_MAX;
      const retryAfterSec = Math.max(1, Math.ceil((lastRequest + minGapMs - now) / 1000));
      return NextResponse.json(
        { error: 'Çok hızlı! Lütfen biraz bekleyin.' },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            'Retry-After': String(retryAfterSec),
          },
        }
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
          { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }

      // Ürün bu bayiye ait mi veya global mı?
      if (product.dealerId && product.dealerId !== session.user.id) {
        return NextResponse.json(
          { error: 'Bu ürüne erişim yetkiniz yok' },
          { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
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
          // Ham müşteri ID'si bayiye sızdırılmaz (gizlilik).
          select: {
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
    // Tüketim/taramadan kazanılan pasif puan. `amount` bayi tarafından kontrol
    // edildiği için, ham `amount * 10` ile sınırsız puan basılmasını engellemek
    // adına baseXP bir tavana sabitlenir ve kullanıcıya yalnızca PASİF puan
    // (baseXP'nin %5'i) verilir — squad'a ve kullanıcıya aynı miktar.
    const BASE_XP_CAP = 1000; // tek tüketimden kazanılabilecek max ham puan
    const rawBaseXP = amount ? Math.floor(amount * 10) : 50;
    const baseXP = Math.min(Math.max(0, rawBaseXP), BASE_XP_CAP);

    // Happy Hour çarpanı: önceden müşteriye "2x puan" gösteriliyordu ama puana HİÇ
    // uygulanmıyordu. Artık bu işletmenin AKTİF happy-hour penceresindeki en yüksek
    // çarpan pasif puana uygulanır (1x = etki yok).
    const nowDate = new Date();
    const dealerHappyHours = await prisma.happyHour.findMany({
      where: { dealerId: session.user.id, isActive: true },
      select: { startTime: true, endTime: true, daysOfWeek: true, isActive: true, validFrom: true, validUntil: true, multiplier: true },
    });
    const activeMultipliers = dealerHappyHours
      .filter((hh) => isHappyHourLive(hh, nowDate))
      .map((hh) => hh.multiplier || 1);
    const happyHourMultiplier = activeMultipliers.length > 0 ? Math.max(...activeMultipliers) : 1;

    // Sezonsal kampanya çarpanı/bonusu happy-hour'dan SONRA pasif puana uygulanır
    // (zaman penceresindeki en yüksek çarpanlı aktif kampanya). Kampanya yoksa no-op.
    const { applySeasonalCampaignMultiplier } = await import('@/lib/seasonal-campaign-live');
    const basePassivePoints = Math.floor(baseXP * 0.05 * happyHourMultiplier);
    const seasonal = await applySeasonalCampaignMultiplier(basePassivePoints, nowDate);
    const passivePoints = seasonal.points;

    if (passivePoints > 0) {
      const squadMembership = await prisma.squadMember.findFirst({
        where: { userId: card.customerId },
        select: { squadId: true },
      });

      if (squadMembership) {
        await prisma.$transaction([
          prisma.squad.update({
            where: { id: squadMembership.squadId },
            data: { totalPoints: { increment: passivePoints } },
          }),
          prisma.user.update({
            where: { id: card.customerId },
            data: { points: { increment: passivePoints } },
          }),
        ]);
      } else {
        await prisma.user.update({
          where: { id: card.customerId },
          data: { points: { increment: passivePoints } },
        });
      }
    }
    // ----------------------------------

    // Isı haritası kovasını artır (kalıcı HeatmapData; ateşle-unut).
    import('@/lib/heatmap-track')
      .then(({ recordHeatmapHit }) =>
        recordHeatmapHit(session.user.id, nowDate, amount || product?.price || 0)
      )
      .catch((err) => console.error('[HEATMAP] consumption track failed:', err));

    // Konum/ziyaret görevlerini ilerlet (ateşle-unut). Müşteri bu işletmeyi
    // ziyaret etti → eşleşen visit_category görevleri otomatik ilerler/tamamlanır.
    if (card.customerId) {
      const visitCustomerId = card.customerId;
      import('@/lib/visit-missions')
        .then(({ advanceVisitMissions }) => advanceVisitMissions(visitCustomerId, session.user.id))
        .catch((err) => console.error('[VISIT_MISSION] advance failed:', err));
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Tüketim kaydı oluşturuldu',
        consumption,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error creating consumption:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Tüketim kaydı oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
