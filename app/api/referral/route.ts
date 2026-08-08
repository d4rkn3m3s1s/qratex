import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { nanoid } from 'nanoid';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { getPointsMatrix, getReferralRewards } from '@/lib/points-rules';
import { assertModuleEnabled } from '@/lib/module-gate';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Get or create referral code
    let referralCode = await prisma.referralCode.findUnique({
      where: { userId: session.user.id },
    });

    if (!referralCode) {
      referralCode = await prisma.referralCode.create({
        data: {
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

const applyReferralSchema = z.object({ code: z.string().min(1).max(32).transform((s) => s.trim().toUpperCase()) });

// POST - Apply referral code
export async function POST(req: NextRequest) {
  try {
    const gate = await assertModuleEnabled('referrals');
    if (gate) return gate;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = applyReferralSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Referral code is required' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const code = parsed.data.code;

    // Check if user already has a referral
    const existingReferral = await prisma.referral.findUnique({
      where: { referredId: session.user.id },
    });

    if (existingReferral) {
      return NextResponse.json({ error: 'You have already used a referral code' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Find the referral code
    const referralCode = await prisma.referralCode.findUnique({
      where: { code },
      select: { id: true, userId: true, code: true, isActive: true, maxUsage: true, usageCount: true },
    });

    if (!referralCode) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (!referralCode.isActive) {
      return NextResponse.json({ error: 'This referral code is no longer active' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (referralCode.userId === session.user.id) {
      return NextResponse.json({ error: 'You cannot use your own referral code' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const innov = await getInnovationPlatformConfig();
    const lifetimeAsReferrer = await prisma.referral.count({
      where: { referrerId: referralCode.userId },
    });
    if (lifetimeAsReferrer >= innov.referral.maxInvitesPerReferrerLifetime) {
      return NextResponse.json(
        { error: 'Bu davet zinciri platform davet limitine ulaştı' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthlyWithCode = await prisma.referral.count({
      where: {
        referralCode: referralCode.code,
        createdAt: { gte: monthStart },
      },
    });
    if (monthlyWithCode >= innov.referral.maxRedemptionsPerReferralCodePerMonth) {
      return NextResponse.json(
        { error: 'Bu referans kodu için aylık kullanım limiti doldu' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Check max usage
    if (referralCode.maxUsage && referralCode.usageCount >= referralCode.maxUsage) {
      return NextResponse.json({ error: 'This referral code has reached its usage limit' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const pointsMatrix = await getPointsMatrix();
    const { referredPoints: REFERRAL_BONUS, referrerPoints: REFERRER_BONUS } =
      getReferralRewards(pointsMatrix);

    // Create referral and update points in transaction.
    // `Referral.referredId` UNIQUE olduğundan, iki eşzamanlı istekten yalnızca
    // biri create'i geçer; diğeri unique violation (P2002) ile tüm tx'i
    // rollback eder — krediler create'ten SONRA geldiği için çift bonus oluşmaz.
    try {
      await prisma.$transaction(async (tx: any) => {
      // Create referral
      await tx.referral.create({
        data: {
          referrerId: referralCode.userId,
          referredId: session.user.id,
          referralCode: referralCode.code,
          status: 'COMPLETED',
          bonusGiven: REFERRAL_BONUS,
          pointsEarned: REFERRER_BONUS,
          completedAt: new Date(),
        },
      });

      // Update referred user's points
      await creditPointsAndXp(tx, {
        userId: session.user.id,
        points: REFERRAL_BONUS,
      });

      // Update referrer's points
      await creditPointsAndXp(tx, {
        userId: referralCode.userId,
        points: REFERRER_BONUS,
      });

      // Anti-fraud görünürlüğü: iki referral kredisini de points_credited yaz (aynı tx).
      await tx.analyticsEvent.createMany({
        data: [
          { userId: session.user.id, event: 'points_credited', category: 'referral', data: { points: REFERRAL_BONUS, role: 'referred' } },
          { userId: referralCode.userId, event: 'points_credited', category: 'referral', data: { points: REFERRER_BONUS, role: 'referrer' } },
        ],
      });

      // Update usage count
      await tx.referralCode.update({
        where: { id: referralCode.id },
        data: { usageCount: { increment: 1 } },
      });

      // Create notifications
      await tx.notification.createMany({
        data: [
          {
            userId: session.user.id,
            type: 'REFERRAL_BONUS',
            title: 'Hoş Geldin Bonusu!',
            message: `Referans kodu kullanarak ${REFERRAL_BONUS} puan kazandın!`,
          },
          {
            userId: referralCode.userId,
            type: 'REFERRAL_COMPLETE',
            title: 'Referans Tamamlandı!',
            message: `Birisi senin referans kodunu kullandı. ${REFERRER_BONUS} puan kazandın!`,
          },
        ],
      });
      });
    } catch (txError) {
      if (
        txError instanceof Prisma.PrismaClientKnownRequestError &&
        txError.code === 'P2002'
      ) {
        return NextResponse.json(
          { error: 'You have already used a referral code' },
          { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      throw txError;
    }

    return NextResponse.json({
      success: true,
      message: `Tebrikler! ${REFERRAL_BONUS} puan kazandın!`,
      pointsEarned: REFERRAL_BONUS,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error applying referral code:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
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
        await creditPointsAndXp(tx, { userId, points: m.points });
        await tx.analyticsEvent.create({
          data: {
            userId, event: 'points_credited', category: 'referral_milestone',
            data: { points: m.points, milestone: m.count },
          },
        });
        totalPoints += m.points;
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
