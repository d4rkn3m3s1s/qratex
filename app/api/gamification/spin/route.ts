import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkIdempotency, storeIdempotency } from '@/lib/idempotency';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { getPointsMatrix, getSpinRules, pickSpinPrize } from '@/lib/points-rules';
import { getVariant } from '@/lib/gamification-ab';

export const dynamic = 'force-dynamic';

function getTodayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

async function getTodaySpinCount(userId: string) {
  const today = getTodayStart();
  return prisma.notification.count({
    where: {
      userId,
      title: '🎡 Günlük Çark',
      createdAt: { gte: today },
    },
  });
}

// POST /api/gamification/spin - Server-side weighted spin and award
export async function POST(request: NextRequest) {
  try {
    const idemCheck = await checkIdempotency(request, 'spin');
    if ('error' in idemCheck) return idemCheck.error;
    if (idemCheck.cached) return idemCheck.response;
    const idemKey = idemCheck.key;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', canSpin: false }, { status: 401 });
    }

    const userId = session.user.id;
    const matrix = await getPointsMatrix();
    const spinRules = getSpinRules(matrix);

    if (!spinRules.enabled) {
      return NextResponse.json(
        { error: 'Çark özelliği şu an pasif', canSpin: false },
        { status: 400 }
      );
    }

    const spinCount = await getTodaySpinCount(userId);
    if (spinCount >= spinRules.dailyLimit) {
      return NextResponse.json(
        { error: 'Bugün zaten çevirdiniz', canSpin: false },
        { status: 400 }
      );
    }

    const prize = pickSpinPrize(matrix);
    const prizeIndex = spinRules.prizes.findIndex((entry) => entry.id === prize.id);
    const abVariant = await getVariant(userId, 'reward_copy');

    const result = await prisma.$transaction(async (tx) => {
      const latestCount = await tx.notification.count({
        where: {
          userId,
          title: '🎡 Günlük Çark',
          createdAt: { gte: getTodayStart() },
        },
      });
      if (latestCount >= spinRules.dailyLimit) {
        return null;
      }

      if (prize.type === 'points') {
        await creditPointsAndXp(tx, { userId, points: prize.value, xp: 0 });
      } else if (prize.type === 'xp') {
        await creditPointsAndXp(tx, { userId, points: 0, xp: prize.value });
      }

      const message =
        prize.type === 'points'
          ? `Çarktan ${prize.value} puan kazandınız!`
          : prize.type === 'xp'
            ? `Çarktan ${prize.value} XP kazandınız!`
            : 'Bir dahaki sefere şansınız açık olsun!';

      const notification = await tx.notification.create({
        data: {
          userId,
          type: prize.type === 'nothing' ? 'info' : 'success',
          title: '🎡 Günlük Çark',
          message,
          data: {
            prizeId: prize.id,
            prizeType: prize.type,
            prizeValue: prize.value,
            prizeLabel: prize.label,
            spinDate: new Date().toISOString(),
            dailyLimit: spinRules.dailyLimit,
          },
        },
      });

      await tx.analyticsEvent.create({
        data: {
          userId,
          event: 'gamification_ab_impression',
          category: 'gamification',
          data: {
            experiment: 'reward_copy',
            variant: abVariant ?? 'default',
            outcome: prize.type,
            prizeId: prize.id,
          },
        },
      });

      return { message, notification };
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Bugün zaten çevirdiniz', canSpin: false },
        { status: 400 }
      );
    }

    const resBody = {
      success: true,
      canSpin: false,
      message: result.message,
      prize: {
        id: prize.id,
        type: prize.type,
        value: prize.value,
        label: prize.label,
        index: prizeIndex >= 0 ? prizeIndex : 0,
      },
      remainingToday: 0,
    };
    if (idemKey) await storeIdempotency(idemKey, 'spin', 200, resBody);
    return NextResponse.json(resBody);
  } catch (error) {
    const { captureApiError } = await import('@/lib/capture-api-error');
    captureApiError(error, { route: 'POST /api/gamification/spin', status: 500 });
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
    const matrix = await getPointsMatrix();
    const spinRules = getSpinRules(matrix);
    const today = getTodayStart();

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

    const spinCount = await getTodaySpinCount(userId);
    const remainingToday = Math.max(0, spinRules.dailyLimit - spinCount);

    return NextResponse.json({
      canSpin: spinRules.enabled && remainingToday > 0,
      enabled: spinRules.enabled,
      dailyLimit: spinRules.dailyLimit,
      remainingToday,
      lastSpin: existingSpin?.createdAt || null,
      lastPrize: existingSpin?.data || null,
      prizes: spinRules.prizes.map((prize) => ({
        id: prize.id,
        label: prize.label,
        type: prize.type,
        value: prize.value,
      })),
    });
  } catch (error) {
    const { captureApiError } = await import('@/lib/capture-api-error');
    captureApiError(error, { route: 'GET /api/gamification/spin' });
    console.error('Spin check error:', error);
    return NextResponse.json({
      canSpin: false,
      error: 'Durum kontrol edilemedi',
    });
  }
}

