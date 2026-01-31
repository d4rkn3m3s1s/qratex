import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { createRewardSchema } from '@/lib/validations';
import crypto from 'crypto';

// Force dynamic rendering - disable caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Generate unique coupon code
function generateCouponCode(rewardType: string): string {
  const prefix = rewardType === 'coupon' || rewardType === 'COUPON' ? 'KPN' : 
                 rewardType === 'digital' || rewardType === 'DIGITAL' ? 'DJT' : 
                 rewardType === 'vip' || rewardType === 'VIP' ? 'VIP' : 'ODL';
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  return `${prefix}-${randomPart}-${timestamp}`;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const myRewards = searchParams.get('myRewards') === 'true';

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

    // Default: get all available rewards
    const rewards = await prisma.reward.findMany({
      where: { isActive: true },
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
    console.error('Rewards fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Ödüller yüklenemedi' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
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
      },
    });

    return NextResponse.json({
      success: true,
      data: reward,
    });
  } catch (error) {
    console.error('Reward create error:', error);
    return NextResponse.json(
      { success: false, error: 'Ödül oluşturulamadı' },
      { status: 500 }
    );
  }
}

// Claim reward endpoint
export async function PATCH(req: Request) {
  try {
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

    // Get user and reward from database (real-time data)
    const [user, reward] = await Promise.all([
      prisma.user.findUnique({ 
        where: { id: session.user.id },
        select: { id: true, points: true, name: true }
      }),
      prisma.reward.findUnique({ 
        where: { id: rewardId },
        select: { id: true, name: true, cost: true, stock: true, isActive: true, type: true }
      }),
    ]);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Kullanıcı bulunamadı' },
        { status: 404 }
      );
    }

    if (!reward || !reward.isActive) {
      return NextResponse.json(
        { success: false, error: 'Ödül bulunamadı veya aktif değil' },
        { status: 404 }
      );
    }

    // Check if user has enough points
    if (user.points < reward.cost) {
      return NextResponse.json(
        { success: false, error: `Yetersiz puan. ${reward.cost - user.points} puan daha gerekiyor.` },
        { status: 400 }
      );
    }

    // Check stock (-1 means unlimited)
    if (reward.stock !== -1 && reward.stock <= 0) {
      return NextResponse.json(
        { success: false, error: 'Bu ödülün stoğu tükendi' },
        { status: 400 }
      );
    }

    // Generate coupon code
    const couponCode = generateCouponCode(reward.type);

    // Transaction: deduct points, decrease stock (if not unlimited), create claim record with coupon
    const [updatedUser, userReward] = await prisma.$transaction(async (tx) => {
      // Deduct points from user
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { points: { decrement: reward.cost } },
      });

      // Create user reward record with coupon code
      const userReward = await tx.userReward.create({
        data: {
          userId: user.id,
          rewardId: reward.id,
          code: couponCode,
        },
      });

      // Only decrease stock if not unlimited (-1)
      if (reward.stock !== -1) {
        await tx.reward.update({
          where: { id: reward.id },
          data: { stock: { decrement: 1 } },
        });
      }

      // Create success notification with coupon code
      await tx.notification.create({
        data: {
          userId: user.id,
          title: '🎁 Ödül Talep Edildi!',
          message: `${reward.name} ödülünü başarıyla talep ettiniz! Kupon kodunuz: ${couponCode}`,
          type: 'success',
          data: {
            rewardId: reward.id,
            rewardName: reward.name,
            couponCode: couponCode,
            cost: reward.cost,
          },
        },
      });

      return [updatedUser, userReward];
    });

    return NextResponse.json({
      success: true,
      message: 'Ödül başarıyla talep edildi',
      data: {
        rewardName: reward.name,
        cost: reward.cost,
        newBalance: updatedUser.points,
        couponCode: couponCode,
        userRewardId: userReward.id,
      }
    });
  } catch (error) {
    console.error('Reward claim error:', error);
    return NextResponse.json(
      { success: false, error: 'Ödül talep edilemedi. Lütfen tekrar deneyin.' },
      { status: 500 }
    );
  }
}

