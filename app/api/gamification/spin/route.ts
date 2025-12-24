import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/gamification/spin - Record a spin and give prize
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', canSpin: false }, { status: 401 });
    }

    const userId = session.user.id;
    const { prizeType, prizeValue, prizeLabel } = await request.json();

    // Check if user already spun today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingSpin = await prisma.notification.findFirst({
      where: {
        userId: userId,
        title: '🎡 Günlük Çark',
        createdAt: {
          gte: today,
        },
      },
    });

    if (existingSpin) {
      return NextResponse.json(
        { error: 'Bugün zaten çevirdiniz', canSpin: false },
        { status: 400 }
      );
    }

    // Apply prize based on type
    let message = '';

    switch (prizeType) {
      case 'points':
        await prisma.user.update({
          where: { id: userId },
          data: { points: { increment: prizeValue } },
        });
        message = `Çarktan ${prizeValue} puan kazandınız!`;
        break;
      case 'xp':
        await prisma.user.update({
          where: { id: userId },
          data: { xp: { increment: prizeValue } },
        });
        message = `Çarktan ${prizeValue} XP kazandınız!`;
        break;
      case 'multiplier':
        // Could store multiplier for next action
        message = `${prizeValue}x bonus kazandınız!`;
        break;
      case 'nothing':
        message = 'Bir dahaki sefere şansınız açık olsun!';
        break;
    }

    // Record the spin as a notification (type: success for prizes, info for nothing)
    await prisma.notification.create({
      data: {
        userId: userId,
        type: prizeType === 'nothing' ? 'info' : 'success',
        title: '🎡 Günlük Çark',
        message: message,
        data: {
          prizeType,
          prizeValue,
          prizeLabel,
          spinDate: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      message,
      prize: { type: prizeType, value: prizeValue, label: prizeLabel },
    });
  } catch (error) {
    console.error('Spin error:', error);
    return NextResponse.json(
      { error: 'Çark çevrilemedi' },
      { status: 500 }
    );
  }
}

// GET /api/gamification/spin - Check if user can spin today
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ canSpin: false, error: 'Not authenticated' }, { status: 200 });
    }

    const userId = session.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingSpin = await prisma.notification.findFirst({
      where: {
        userId: userId,
        title: '🎡 Günlük Çark',
        createdAt: {
          gte: today,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      canSpin: !existingSpin,
      lastSpin: existingSpin?.createdAt || null,
      lastPrize: existingSpin?.data || null,
    });
  } catch (error) {
    console.error('Spin check error:', error);
    return NextResponse.json({
      canSpin: false,
      error: 'Durum kontrol edilemedi',
    });
  }
}

