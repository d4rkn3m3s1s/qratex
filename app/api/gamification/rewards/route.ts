import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { checkIdempotency, storeIdempotency } from '@/lib/idempotency';
import { createRewardSchema } from '@/lib/validations';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import crypto from 'crypto';
import { debitPoints, InsufficientPointsError } from '@/lib/points-wallet';
import { getVariant } from '@/lib/gamification-ab';
import { captureApiError } from '@/lib/capture-api-error';
import { assertModuleEnabled } from '@/lib/module-gate';

// Force dynamic rendering - disable caching
export const dynamic = 'force-dynamic';

// Generate unique coupon code
function generateCouponCode(rewardType: string): string {
  const prefix = rewardType === 'coupon' || rewardType === 'COUPON' ? 'KPN' : 
                 rewardType === 'digital' || rewardType === 'DIGITAL' ? 'DJT' : 
                 rewardType === 'vip' || rewardType === 'VIP' ? 'VIP' : 'ODL';
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  return `${prefix}-${randomPart}-${timestamp}`;
}

type RewardPoolRules = {
  perUserLimit: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
};

function parseRewardPoolRules(metadata: unknown): RewardPoolRules {
  if (!metadata || typeof metadata !== 'object') {
    return {
      perUserLimit: null,
      validFrom: null,
      validUntil: null,
    };
  }

  const payload = metadata as Record<string, unknown>;
  const perUserLimitRaw = payload.perUserLimit;
  const validFromRaw = payload.validFrom;
  const validUntilRaw = payload.validUntil;

  const perUserLimit =
    typeof perUserLimitRaw === 'number' && Number.isFinite(perUserLimitRaw)
      ? Math.max(1, Math.floor(perUserLimitRaw))
      : null;

  const validFrom =
    typeof validFromRaw === 'string' && !Number.isNaN(Date.parse(validFromRaw))
      ? new Date(validFromRaw)
      : null;

  const validUntil =
    typeof validUntilRaw === 'string' && !Number.isNaN(Date.parse(validUntilRaw))
      ? new Date(validUntilRaw)
      : null;

  return {
    perUserLimit,
    validFrom,
    validUntil,
  };
}

export async function GET(req: Request) {
  try {
    const gate = await assertModuleEnabled('rewards');
    if (gate) return gate;
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const myRewards = searchParams.get('myRewards') === 'true';
    const status = searchParams.get('status');

    // If requesting user's claimed rewards
    if (myRewards && session?.user?.id) {
      const userRewards = await prisma.userReward.findMany({
        where: { userId: session.user.id },
        include: {
          reward: {
            select: {
              id: true,
              name: true,
              description: true,
              icon: true,
              type: true,
              cost: true,
            },
          },
        },
        orderBy: { redeemedAt: 'desc' },
      });

      return NextResponse.json({
        success: true,
        data: userRewards.map(ur => ({
          id: ur.id,
          code: ur.code,
          redeemedAt: ur.redeemedAt,
          claimedAt: ur.claimedAt,
          isUsed: !!ur.claimedAt,
          reward: ur.reward,
        })),
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    }

    const isAdmin = session?.user?.role === 'ADMIN';
    const isActiveFilter = status === 'inactive' ? false : status === 'active' ? true : undefined;

    // Default: get all available rewards
    const rewards = await prisma.reward.findMany({
      where: {
        ...(isAdmin
          ? isActiveFilter !== undefined
            ? { isActive: isActiveFilter }
            : {}
          : { isActive: true }),
      },
      include: {
        _count: {
          select: { users: true },
        },
      },
      orderBy: { cost: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: rewards,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    captureApiError(error, { route: 'GET /api/gamification/rewards', status: 500 });
    console.error('Rewards fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Ödüller yüklenemedi' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const gate = await assertModuleEnabled('rewards');
    if (gate) return gate;
    const auditMeta = getAuditRequestMeta(req);
    const session = await getServerSession(authOptions);

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Yetkisiz erişim' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validatedData = createRewardSchema.parse(body);

    const reward = await prisma.reward.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
        icon: validatedData.icon,
        cost: validatedData.cost,
        stock: validatedData.stock,
        type: validatedData.type,
        ...(validatedData.metadata ? { metadata: validatedData.metadata as object } : {}),
        isActive: true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE_REWARD',
        entity: 'Reward',
        entityId: reward.id,
        newData: reward as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({
      success: true,
      data: reward,
    });
  } catch (err) {
    captureApiError(err, { route: 'POST /api/gamification/rewards', status: 500 });
    console.error('Reward create error:', err);
    return NextResponse.json(
      { success: false, error: 'Ödül oluşturulamadı' },
      { status: 500 }
    );
  }
}

// Claim reward endpoint
export async function PATCH(req: Request) {
  try {
    const gate = await assertModuleEnabled('rewards');
    if (gate) return gate;
    const idemCheck = await checkIdempotency(req, 'reward-claim');
    if ('error' in idemCheck) return idemCheck.error;
    if (idemCheck.cached) return idemCheck.response;
    const idemKey = idemCheck.key;

    const auditMeta = getAuditRequestMeta(req);
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Giriş yapmalısınız' },
        { status: 401 }
      );
    }

    const { rewardId } = await req.json();

    if (!rewardId) {
      return NextResponse.json(
        { success: false, error: 'Ödül ID gerekli' },
        { status: 400 }
      );
    }

    const [user, reward] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, points: true },
      }),
      prisma.reward.findUnique({
        where: { id: rewardId },
        select: {
          id: true,
          name: true,
          cost: true,
          stock: true,
          isActive: true,
          type: true,
          metadata: true,
        },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı' }, { status: 404 });
    }

    if (!reward || !reward.isActive) {
      return NextResponse.json(
        { success: false, error: 'Ödül bulunamadı veya aktif değil' },
        { status: 404 }
      );
    }

    const couponCode = generateCouponCode(reward.type);
    const poolRules = parseRewardPoolRules(reward.metadata);
    const now = new Date();

    if (poolRules.validFrom && now < poolRules.validFrom) {
      return NextResponse.json(
        { success: false, error: 'Bu ödül henüz aktif değil' },
        { status: 400 }
      );
    }

    if (poolRules.validUntil && now > poolRules.validUntil) {
      return NextResponse.json(
        { success: false, error: 'Bu ödülün süresi doldu' },
        { status: 400 }
      );
    }

    const abVariant = await getVariant(session.user.id, 'reward_copy');

    const [updatedUser, userReward] = await prisma.$transaction(async (tx) => {
      if (poolRules.perUserLimit) {
        const userClaimCount = await tx.userReward.count({
          where: {
            userId: user.id,
            rewardId: reward.id,
          },
        });

        if (userClaimCount >= poolRules.perUserLimit) {
          throw new Error('REWARD_USER_LIMIT_REACHED');
        }
      }

      if (reward.stock !== -1) {
        const stockUpdate = await tx.reward.updateMany({
          where: {
            id: reward.id,
            stock: { gt: 0 },
          },
          data: {
            stock: { decrement: 1 },
          },
        });

        if (stockUpdate.count === 0) {
          throw new Error('REWARD_OUT_OF_STOCK');
        }
      }

      const updatedWallet = await debitPoints(tx, {
        userId: user.id,
        points: reward.cost,
      });

      const claimedReward = await tx.userReward.create({
        data: {
          userId: user.id,
          rewardId: reward.id,
          code: couponCode,
        },
      });

      await tx.notification.create({
        data: {
          userId: user.id,
          title: '🎁 Ödül Talep Edildi!',
          message: `${reward.name} ödülünü başarıyla talep ettiniz! Kupon kodunuz: ${couponCode}`,
          type: 'success',
          data: {
            rewardId: reward.id,
            rewardName: reward.name,
            couponCode,
            cost: reward.cost,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'CLAIM_REWARD',
          entity: 'Reward',
          entityId: reward.id,
          newData: {
            rewardId: reward.id,
            rewardName: reward.name,
            couponCode,
            cost: reward.cost,
            remainingPoints: updatedWallet.points,
          },
          ...auditMeta,
        },
      });

      await tx.analyticsEvent.create({
        data: {
          userId: user.id,
          event: 'gamification_ab_impression',
          category: 'gamification',
          data: {
            experiment: 'reward_copy',
            variant: abVariant ?? 'default',
            outcome: 'reward_claim',
            rewardId: reward.id,
          },
        },
      });

      return [updatedWallet, claimedReward];
    });

    const resBody = {
      success: true,
      message: 'Ödül başarıyla talep edildi',
      data: {
        rewardName: reward.name,
        cost: reward.cost,
        newBalance: updatedUser.points,
        couponCode: couponCode,
        userRewardId: userReward.id,
      },
    };
    if (idemKey) await storeIdempotency(idemKey, 'reward-claim', 200, resBody);
    return NextResponse.json(resBody);
  } catch (error) {
    if (error instanceof InsufficientPointsError) {
      return NextResponse.json(
        {
          success: false,
          error: `Yetersiz puan. ${Math.max(0, error.requiredPoints - error.currentPoints)} puan daha gerekiyor.`,
        },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message === 'REWARD_OUT_OF_STOCK') {
      return NextResponse.json({ success: false, error: 'Bu ödülün stoğu tükendi' }, { status: 400 });
    }

    if (error instanceof Error && error.message === 'REWARD_USER_LIMIT_REACHED') {
      return NextResponse.json(
        { success: false, error: 'Bu ödülü talep etme limitine ulaştınız' },
        { status: 400 }
      );
    }

    captureApiError(error, { route: 'PATCH /api/gamification/rewards', status: 500 });
    console.error('Reward claim error:', error);
    return NextResponse.json(
      { success: false, error: 'Ödül talep edilemedi. Lütfen tekrar deneyin.' },
      { status: 500 }
    );
  }
}

