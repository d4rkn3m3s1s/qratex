import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - Get user's streak info
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get or create streak record
    let streak = await (prisma as any).userStreak.findUnique({
      where: { userId: session.user.id },
    });

    if (!streak) {
      streak = await (prisma as any).userStreak.create({
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
        streak = await (prisma as any).userStreak.update({
          where: { userId: session.user.id },
          data: { currentStreak: 0 },
        });
      }
    }

    // Calculate streak bonus
    const streakBonuses = [
      { days: 7, bonus: 100, label: '1 Hafta' },
      { days: 14, bonus: 250, label: '2 Hafta' },
      { days: 30, bonus: 500, label: '1 Ay' },
      { days: 60, bonus: 1000, label: '2 Ay' },
      { days: 90, bonus: 2000, label: '3 Ay' },
      { days: 180, bonus: 5000, label: '6 Ay' },
      { days: 365, bonus: 10000, label: '1 Yıl' },
    ];

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
    });
  } catch (error) {
    console.error('Error fetching streak:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Check in for the day (update streak)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = await req.json();

    // Get current streak
    let streak = await (prisma as any).userStreak.findUnique({
      where: { userId: session.user.id },
    });

    if (!streak) {
      streak = await (prisma as any).userStreak.create({
        data: { userId: session.user.id },
      });
    }

    if (action === 'freeze' && streak.streakFreezes > 0) {
      // Use a freeze ticket
      const frozenUntil = new Date();
      frozenUntil.setDate(frozenUntil.getDate() + 1);

      streak = await (prisma as any).userStreak.update({
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
      });
    }

    const now = new Date();
    const lastActivity = streak.lastActivityAt ? new Date(streak.lastActivityAt) : null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Check if already checked in today
    if (lastActivity) {
      const lastActivityDate = new Date(
        lastActivity.getFullYear(),
        lastActivity.getMonth(),
        lastActivity.getDate()
      );
      
      if (lastActivityDate.getTime() === today.getTime()) {
        return NextResponse.json({
          success: true,
          message: 'Bugün zaten check-in yaptın!',
          streak,
          alreadyCheckedIn: true,
        });
      }
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

    // Check for milestone bonus
    const milestones = [7, 14, 30, 60, 90, 180, 365];
    const bonusMap: { [key: number]: number } = {
      7: 100, 14: 250, 30: 500, 60: 1000, 90: 2000, 180: 5000, 365: 10000,
    };
    
    let bonusEarned = 0;
    const milestoneReached = milestones.find(m => m === newStreak);
    if (milestoneReached) {
      bonusEarned = bonusMap[milestoneReached];
    }

    // Update streak
    streak = await (prisma as any).userStreak.update({
      where: { userId: session.user.id },
      data: {
        currentStreak: newStreak,
        longestStreak: Math.max(streak.longestStreak, newStreak),
        lastActivityAt: now,
        totalActiveDays: { increment: 1 },
        frozenUntil: null,
      },
    });

    // Award bonus points if milestone reached
    if (bonusEarned > 0) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { points: { increment: bonusEarned } },
      });

      await prisma.notification.create({
        data: {
          userId: session.user.id,
          type: 'STREAK_MILESTONE',
          title: 'Seri Başarısı!',
          message: `${newStreak} günlük seri! ${bonusEarned} bonus puan kazandın!`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: bonusEarned > 0 
        ? `🔥 ${newStreak} gün! ${bonusEarned} bonus puan kazandın!`
        : `🔥 ${newStreak} günlük seri!`,
      streak,
      bonusEarned,
      milestoneReached: !!milestoneReached,
    });
  } catch (error) {
    console.error('Error updating streak:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
