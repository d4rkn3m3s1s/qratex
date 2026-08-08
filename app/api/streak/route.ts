import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { getPointsMatrix, getStreakMilestoneBonus, getStreakMilestones } from '@/lib/points-rules';
import { z } from 'zod';

// GET - Get user's streak info

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const matrix = await getPointsMatrix();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Get or create streak record
    let streak = await prisma.userStreak.findUnique({
      where: { userId: session.user.id },
    });

    if (!streak) {
      streak = await prisma.userStreak.create({
        data: { userId: session.user.id },
      });
    }

    // Check if streak is broken
    const now = new Date();
    const lastActivity = streak.lastActivityAt ? new Date(streak.lastActivityAt) : null;
    
    if (lastActivity) {
      const hoursDiff = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
      const daysDiff = Math.floor(hoursDiff / 24);
      
      // If more than 1 day has passed and not frozen, break streak
      if (daysDiff > 1 && (!streak.frozenUntil || new Date(streak.frozenUntil) < now)) {
        streak = await prisma.userStreak.update({
          where: { userId: session.user.id },
          data: { currentStreak: 0 },
        });
      }
    }

    // Calculate streak bonus
    const streakBonuses = getStreakMilestones(matrix).map((entry) => ({
      days: entry.days,
      bonus: entry.points,
      label: `${entry.days} Gün`,
    }));

    const nextMilestone = streakBonuses.find(b => b.days > streak.currentStreak);
    const daysUntilNextMilestone = nextMilestone ? nextMilestone.days - streak.currentStreak : null;

    return NextResponse.json({
      success: true,
      streak: {
        ...streak,
        isActive: lastActivity && 
          (new Date().getTime() - new Date(lastActivity).getTime()) < (48 * 60 * 60 * 1000),
      },
      nextMilestone,
      daysUntilNextMilestone,
      streakBonuses,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error fetching streak:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

const streakPostBodySchema = z.object({ action: z.enum(['freeze']).optional() }).strict();

// POST - Check in for the day (update streak)
export async function POST(req: NextRequest) {
  try {
    const matrix = await getPointsMatrix();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const rawBody = await req.json().catch(() => ({}));
    const bodyParsed = streakPostBodySchema.safeParse(rawBody);
    if (!bodyParsed.success) {
      return NextResponse.json(
        { error: 'Geçersiz istek gövdesi' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const { action } = bodyParsed.data;

    // Get current streak
    let streak = await prisma.userStreak.findUnique({
      where: { userId: session.user.id },
    });

    if (!streak) {
      streak = await prisma.userStreak.create({
        data: { userId: session.user.id },
      });
    }

    if (action === 'freeze' && streak.streakFreezes > 0) {
      // Use a freeze ticket
      const frozenUntil = new Date();
      frozenUntil.setDate(frozenUntil.getDate() + 1);

      streak = await prisma.userStreak.update({
        where: { userId: session.user.id },
        data: {
          streakFreezes: { decrement: 1 },
          frozenUntil,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Streak donduruldu! 24 saat boyunca seri korunacak.',
        streak,
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const now = new Date();
    const lastActivity = streak.lastActivityAt ? new Date(streak.lastActivityAt) : null;
    // Gün sınırı UTC üzerinden (backend = UTC kuralı, lib/timezone.ts).
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Ön kontrol — asıl koruma tx içindeki koşullu updateMany guard'ı.
    if (lastActivity && lastActivity >= todayStart) {
      return NextResponse.json({
        success: true,
        message: 'Bugün zaten check-in yaptın!',
        streak,
        alreadyCheckedIn: true,
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Calculate new streak
    let newStreak = 1;
    if (lastActivity) {
      const hoursDiff = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
      const daysDiff = Math.floor(hoursDiff / 24);

      if (daysDiff <= 1 || (streak.frozenUntil && new Date(streak.frozenUntil) >= now)) {
        newStreak = streak.currentStreak + 1;
      }
    }

    const bonusEarned = getStreakMilestoneBonus(newStreak, matrix);
    const milestoneReached = bonusEarned > 0;
    const prevLongestStreak = streak.longestStreak;

    // Atomik guard + kredi tek transaction içinde. updateMany koşulu
    // "lastActivityAt bugünden önce VEYA null"; iki eşzamanlı check-in'den
    // yalnızca biri count=1 alır, diğeri bonus krediyi ASLA çalıştırmaz.
    const checkInResult = await prisma.$transaction(async (tx) => {
      const guard = await tx.userStreak.updateMany({
        where: {
          userId: session.user.id,
          OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: todayStart } }],
        },
        data: {
          currentStreak: newStreak,
          longestStreak: Math.max(prevLongestStreak, newStreak),
          lastActivityAt: now,
          totalActiveDays: { increment: 1 },
          frozenUntil: null,
        },
      });

      if (guard.count === 0) {
        return { checkedIn: false as const };
      }

      if (bonusEarned > 0) {
        await creditPointsAndXp(tx, {
          userId: session.user.id,
          points: bonusEarned,
        });

        // Anti-fraud görünürlüğü: kredilenen puanı points_credited olarak işle
        // (caps + velocity dedektörü loyalty streak ekonomisini de görsün). Aynı tx.
        await tx.analyticsEvent.create({
          data: {
            userId: session.user.id,
            event: 'points_credited',
            category: 'loyalty_streak',
            data: { points: bonusEarned, milestone: newStreak },
          },
        });

        await tx.notification.create({
          data: {
            userId: session.user.id,
            type: 'STREAK_MILESTONE',
            title: 'Seri Başarısı!',
            message: `${newStreak} günlük seri! ${bonusEarned} bonus puan kazandın!`,
          },
        });
      }

      const updated = await tx.userStreak.findUnique({ where: { userId: session.user.id } });
      return { checkedIn: true as const, streak: updated };
    });

    if (!checkInResult.checkedIn) {
      return NextResponse.json({
        success: true,
        message: 'Bugün zaten check-in yaptın!',
        streak,
        alreadyCheckedIn: true,
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    streak = checkInResult.streak ?? streak;

    return NextResponse.json({
      success: true,
      message: bonusEarned > 0
        ? `🔥 ${newStreak} gün! ${bonusEarned} bonus puan kazandın!`
        : `🔥 ${newStreak} günlük seri!`,
      streak,
      bonusEarned,
      milestoneReached,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error updating streak:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
