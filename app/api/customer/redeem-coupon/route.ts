import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/**
 * POST /api/customer/redeem-coupon
 * Müşteri bir kupon kodunu kullanır. Doğrulamalar: aktif, süresi geçmemiş,
 * kullanım limiti dolmamış, bu kullanıcı daha önce kullanmamış. usedCount
 * atomik guarded updateMany ile artırılır (limit yarışını engeller). Kullanım
 * AnalyticsEvent (category: coupon) olarak kaydedilir → çift kullanım kontrolü.
 */
const schema = z.object({ code: z.string().min(3).max(40) });

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const userId = session.user.id;

    // Brute-force kod denemesini sınırla.
    const rl = await checkRateLimitDb(`redeem_coupon:${userId}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla deneme. Lütfen bir dakika bekleyin.' },
        { status: 429, headers: { ...PRIVATE_NO_STORE_HEADERS, 'Retry-After': String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
      );
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz kod' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const code = parsed.data.code.toUpperCase();

    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon || !coupon.isActive) {
      return NextResponse.json({ error: 'Kupon bulunamadı veya pasif' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Kuponun süresi dolmuş' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Bu kullanıcı daha önce kullandı mı? (AnalyticsEvent ile tek kullanım.)
    const prior = await prisma.analyticsEvent.findFirst({
      where: {
        userId,
        event: 'coupon_redeemed',
        category: 'coupon',
        data: { path: ['couponId'], equals: coupon.id },
      },
      select: { id: true },
    });
    if (prior) {
      return NextResponse.json({ error: 'Bu kuponu zaten kullandınız' }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Atomik kullanım: limitsiz (maxUses = -1) ya da usedCount < maxUses iken artır.
    const result = await prisma.$transaction(async (tx) => {
      const inc = await tx.coupon.updateMany({
        where: {
          id: coupon.id,
          isActive: true,
          OR: [{ maxUses: -1 }, { usedCount: { lt: coupon.maxUses } }],
        },
        data: { usedCount: { increment: 1 } },
      });
      if (inc.count === 0) {
        return { ok: false as const };
      }
      await tx.analyticsEvent.create({
        data: {
          userId,
          event: 'coupon_redeemed',
          category: 'coupon',
          data: { couponId: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value },
        },
      });
      return { ok: true as const };
    });

    if (!result.ok) {
      return NextResponse.json({ error: 'Kupon kullanım limiti dolmuş' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }

    return NextResponse.json(
      {
        success: true,
        coupon: {
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          minPurchase: coupon.minPurchase,
        },
        message:
          coupon.type === 'percentage'
            ? `%${coupon.value} indirim kuponunuz tanımlandı.`
            : `${coupon.value} puanlık/tutarlık indirim kuponunuz tanımlandı.`,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[REDEEM_COUPON_ERROR]', error);
    return NextResponse.json({ error: 'Kupon kullanılamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
