import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { createRewardSchema } from '@/lib/validations';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    const rewards = await prisma.reward.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { users: true },
        },
        ...(userId && {
          users: {
            where: { userId },
            select: {
              claimedAt: true,
            },
          },
        }),
      },
      orderBy: { cost: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: rewards,
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

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Giriş yapmalısınız' },
        { status: 401 }
      );
    }

    const { rewardId } = await req.json();

    // Get user and reward
    const [user, reward] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.user.id } }),
      prisma.reward.findUnique({ where: { id: rewardId } }),
    ]);

    if (!user || !reward) {
      return NextResponse.json(
        { success: false, error: 'Kullanıcı veya ödül bulunamadı' },
        { status: 404 }
      );
    }

    if (user.points < reward.cost) {
      return NextResponse.json(
        { success: false, error: 'Yetersiz puan' },
        { status: 400 }
      );
    }

    if (reward.stock <= 0) {
      return NextResponse.json(
        { success: false, error: 'Stok tükendi' },
        { status: 400 }
      );
    }

    // Transaction: deduct points, decrease stock, create claim record
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { points: { decrement: reward.cost } },
      }),
      prisma.reward.update({
        where: { id: reward.id },
        data: { stock: { decrement: 1 } },
      }),
      prisma.userReward.create({
        data: {
          userId: user.id,
          rewardId: reward.id,
        },
      }),
      prisma.notification.create({
        data: {
          userId: user.id,
          title: 'Ödül Talep Edildi',
          message: `${reward.name} ödülünü başarıyla talep ettiniz!`,
          type: 'REWARD',
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Ödül başarıyla talep edildi',
    });
  } catch (error) {
    console.error('Reward claim error:', error);
    return NextResponse.json(
      { success: false, error: 'Ödül talep edilemedi' },
      { status: 500 }
    );
  }
}

