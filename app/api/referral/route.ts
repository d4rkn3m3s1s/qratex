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

    // Stats
    const stats = {
      totalReferrals: referrals.length,
      completedReferrals: referrals.filter((r) => r.status === 'COMPLETED').length,
      totalPointsEarned: referrals.reduce((sum, r) => sum + r.pointsEarned, 0),
    };

    return NextResponse.json({
      success: true,
      referralCode: referralCode.code,
      referrals,
      referredBy,
      stats,
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
