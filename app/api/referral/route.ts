import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { getPointsMatrix, getReferralRewards } from '@/lib/points-rules';
import { assertModuleEnabled } from '@/lib/module-gate';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';

// GET - Get user's referral info

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const gate = await assertModuleEnabled('referrals');
    if (gate) return gate;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Stats
    const stats = {
      totalReferrals: referrals.length,
      completedReferrals: referrals.filter((r: any) => r.status === 'COMPLETED').length,
      totalPointsEarned: referrals.reduce((sum: number, r: any) => sum + r.pointsEarned, 0),
    };

    return NextResponse.json({
      success: true,
      referralCode: referralCode.code,
      referrals,
      referredBy,
      stats,
    });
  } catch (error) {
    console.error('Error fetching referral info:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Apply referral code
export async function POST(req: NextRequest) {
  try {
    const gate = await assertModuleEnabled('referrals');
    if (gate) return gate;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await req.json();

    if (!code) {
      return NextResponse.json({ error: 'Referral code is required' }, { status: 400 });
    }

    // Check if user already has a referral
    const existingReferral = await prisma.referral.findUnique({
      where: { referredId: session.user.id },
    });

    if (existingReferral) {
      return NextResponse.json({ error: 'You have already used a referral code' }, { status: 400 });
    }

    // Find the referral code
    const referralCode = await prisma.referralCode.findUnique({
      where: { code: code.toUpperCase() },
      include: { user: true },
    });

    if (!referralCode) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 });
    }

    if (!referralCode.isActive) {
      return NextResponse.json({ error: 'This referral code is no longer active' }, { status: 400 });
    }

    if (referralCode.userId === session.user.id) {
      return NextResponse.json({ error: 'You cannot use your own referral code' }, { status: 400 });
    }

    const innov = await getInnovationPlatformConfig();
    const lifetimeAsReferrer = await prisma.referral.count({
      where: { referrerId: referralCode.userId },
    });
    if (lifetimeAsReferrer >= innov.referral.maxInvitesPerReferrerLifetime) {
      return NextResponse.json(
        { error: 'Bu davet zinciri platform davet limitine ulaştı' },
        { status: 400 }
      );
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
        { error: 'Bu referans kodu için aylık kullanım limiti doldu' },
        { status: 400 }
      );
    }

    // Check max usage
    if (referralCode.maxUsage && referralCode.usageCount >= referralCode.maxUsage) {
      return NextResponse.json({ error: 'This referral code has reached its usage limit' }, { status: 400 });
    }

    const pointsMatrix = await getPointsMatrix();
    const { referredPoints: REFERRAL_BONUS, referrerPoints: REFERRER_BONUS } =
      getReferralRewards(pointsMatrix);

    // Create referral and update points in transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // Create referral
      const referral = await tx.referral.create({
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

      return referral;
    });

    return NextResponse.json({
      success: true,
      message: `Tebrikler! ${REFERRAL_BONUS} puan kazandın!`,
      pointsEarned: REFERRAL_BONUS,
    });
  } catch (error) {
    console.error('Error applying referral code:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
