import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { nanoid } from 'nanoid';
import { getPointsMatrix, getReferralRewards } from '@/lib/points-rules';
import { assertModuleEnabled } from '@/lib/module-gate';
import {
  createPendingReferral,
  qualifyReferral,
  REFERRAL_REJECT_MESSAGES,
  REFERRAL_REJECT_STATUS,
} from '@/lib/referral';
import { mintPoints } from '@/lib/economy';
import {
  REFERRAL_MILESTONES,
  parseClaimedReferralMilestones,
  claimableReferralMilestones,
  referralProgress,
} from '@/lib/referral-milestones';
import { z } from 'zod';

// GET - Get user's referral info

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const gate = await assertModuleEnabled('referrals');
    if (gate) return gate;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Get or create referral code
    let referralCode = await prisma.referralCode.findUnique({
      where: { userId: session.user.id },
    });

    if (!referralCode) {
      // upsert: aynı kullanıcının eşzamanlı iki ilk açılışı P2002 ile 500 vermesin.
      referralCode = await prisma.referralCode.upsert({
        where: { userId: session.user.id },
        update: {},
        create: {
          userId: session.user.id,
          code: nanoid(8).toUpperCase(),
        },
      });
    }

    // Get referrals made by user
    const referrals = await prisma.referral.findMany({
      where: { referrerId: session.user.id },
      include: {
        referred: {
          select: { id: true, name: true, image: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Get who referred this user
    const referredBy = await prisma.referral.findUnique({
      where: { referredId: session.user.id },
      include: {
        referrer: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    // Başarılı davet sayısı — milestone için GERÇEK count (liste take:20 ile sınırlı, o sayılmaz).
    const completedCount = await prisma.referral.count({
      where: { referrerId: session.user.id, status: 'COMPLETED' },
    });

    // Stats (liste 20 ile sınırlı; toplam kazanç için de gerçek toplam kullan).
    const stats = {
      totalReferrals: await prisma.referral.count({ where: { referrerId: session.user.id } }),
      completedReferrals: completedCount,
      // Bekleyen: davet edilen henüz e-postasını doğrulayıp ilk QR deneyimini tamamlamadı.
      pendingReferrals: await prisma.referral.count({ where: { referrerId: session.user.id, status: 'PENDING' } }),
      totalPointsEarned: referrals.reduce((sum, r) => sum + r.pointsEarned, 0),
    };

    // Kademe (milestone) durumu: talep edilebilir kademeler + bir sonraki hedefe ilerleme.
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { referralMilestonesClaimed: true },
    });
    const claimed = parseClaimedReferralMilestones(me?.referralMilestonesClaimed);
    const milestones = {
      all: REFERRAL_MILESTONES,
      claimed,
      claimable: claimableReferralMilestones(completedCount, claimed),
      progress: referralProgress(completedCount),
    };

    // Gerçek ödül değerleri (UI'deki hardcoded 1000/500 tutarsızlığını gider).
    const matrix = await getPointsMatrix();
    const { referredPoints, referrerPoints } = getReferralRewards(matrix);

    return NextResponse.json({
      success: true,
      referralCode: referralCode.code,
      referrals,
      referredBy,
      stats,
      milestones,
      rewards: { referredPoints, referrerPoints },
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error fetching referral info:', error);
    return NextResponse.json({ error: 'Davet bilgileri yüklenemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

const applyReferralSchema = z.object({ code: z.string().min(1).max(32) });

/**
 * POST - Davet kodu uygula (P0-16). Kod yalnız BEKLEYEN davet olarak kaydedilir; puan,
 * e-posta doğrulanıp ilk QR olayı gerçekleşince `qualifyReferral` ile tek seferlik verilir.
 * Kullanıcı bu koşulları zaten sağlıyorsa nitelendirme hemen denenir.
 * Modül kapısı, limitler, kendi kodu ve karşılıklı davet (A↔B) reddi servis içinde.
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await assertModuleEnabled('referrals');
    if (gate) return gate;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = applyReferralSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: REFERRAL_REJECT_MESSAGES.INVALID_CODE, code: 'INVALID_CODE' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const userId = session.user.id;
    const created = await createPendingReferral({ referredUserId: userId, code: parsed.data.code });
    if (!created.ok) {
      return NextResponse.json(
        { error: created.message, code: created.code },
        { status: REFERRAL_REJECT_STATUS[created.code], headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Koşullar zaten sağlanıyorsa (doğrulanmış e-posta + daha önce QR geri bildirimi) hemen öde.
    const qualified = await qualifyReferral(userId).catch((e: unknown) => {
      console.error('[REFERRAL_QUALIFY]', userId, e);
      return null;
    });

    if (qualified?.qualified) {
      return NextResponse.json({
        success: true,
        status: 'COMPLETED',
        message: `Tebrikler! ${qualified.referredPoints} puan kazandın!`,
        pointsEarned: qualified.referredPoints,
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    return NextResponse.json({
      success: true,
      status: 'PENDING',
      message: 'Davet kodun kaydedildi. E-postanı doğrulayıp ilk QR deneyimini tamamladığında ödülün hesabına işlenecek.',
      pointsEarned: 0,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error applying referral code:', error);
    return NextResponse.json({ error: 'Davet kodu uygulanamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/**
 * PUT - Ulaşılmış referral KADEME ödüllerini talep eder. Sunucu, başarılı davet sayısını
 * yeniden sayar (istemciye güvenmez) ve talep edilebilir kademeleri ATOMİK olarak öder:
 * User.referralMilestonesClaimed guard'lı updateMany ile idempotent (çift ödül imkânsız) +
 * her kademe için points_credited (invariant #3). Aynı tx.
 */
export async function PUT() {
  try {
    const gate = await assertModuleEnabled('referrals');
    if (gate) return gate;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const userId = session.user.id;

    const completedCount = await prisma.referral.count({
      where: { referrerId: userId, status: 'COMPLETED' },
    });

    const result = await prisma.$transaction(async (tx) => {
      // Talep durumunu tx içinde taze oku (yarış: iki eşzamanlı PUT çift ödemesin).
      const u = await tx.user.findUnique({ where: { id: userId }, select: { referralMilestonesClaimed: true } });
      const claimed = parseClaimedReferralMilestones(u?.referralMilestonesClaimed);
      const claimable = claimableReferralMilestones(completedCount, claimed);
      if (claimable.length === 0) return { awarded: 0, points: 0 };

      const newClaimed = [...claimed, ...claimable.map((m) => m.count)].sort((a, b) => a - b);
      // Guard: yalnızca claimed JSON'u tx başındaki değerle AYNIYSA güncelle. İki eşzamanlı
      // PUT'tan biri güncellerse diğerinin `equals` filtresi tutmaz (count=0) → çift ödül yok.
      const guard = await tx.user.updateMany({
        where: {
          id: userId,
          referralMilestonesClaimed: claimed.length
            ? { equals: u?.referralMilestonesClaimed as Prisma.InputJsonValue }
            : { equals: Prisma.AnyNull },
        },
        data: { referralMilestonesClaimed: newClaimed },
      });
      if (guard.count === 0) return { awarded: 0, points: 0 }; // eşzamanlı istek aldı

      let totalPoints = 0;
      for (const m of claimable) {
        // mintPoints: kilit + defter + points_credited{referral_milestone} aynı tx'te; kademe
        // anahtarı ikinci savunma hattı (JSON guard'ının yanında) — aynı kademe iki kez ödenmez.
        const minted = await mintPoints(tx, {
          userId,
          points: m.points,
          source: 'referral_milestone',
          sourceId: String(m.count),
          idempotencyKey: `referral_milestone:${userId}:${m.count}`,
          meta: { milestone: m.count },
        });
        totalPoints += minted.duplicate ? 0 : minted.credited;
      }
      await tx.notification.create({
        data: {
          userId, type: 'success', title: '🎁 Davet kademesi ödülü!',
          message: `${claimable.map((m) => m.label).join(', ')} açıldı — toplam +${totalPoints} puan kazandın!`,
        },
      });
      return { awarded: claimable.length, points: totalPoints };
    });

    if (result.awarded === 0) {
      return NextResponse.json(
        { success: false, error: 'Talep edilebilir kademe ödülü yok.' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true, awarded: result.awarded, points: result.points, progress: referralProgress(completedCount) },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error claiming referral milestones:', error);
    return NextResponse.json({ error: 'Kademe ödülü alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
