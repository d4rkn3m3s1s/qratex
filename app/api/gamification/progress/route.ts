import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';


export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Get user's gamification data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        points: true,
        level: true,
        xp: true,
        _count: {
          select: {
            feedbacks: true,
            badges: true,
            quests: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Calculate additional stats
    const thisWeekStart = new Date();
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
    thisWeekStart.setHours(0, 0, 0, 0);

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);

    const [weeklyFeedbacks, monthlyFeedbacks] = await Promise.all([
      prisma.feedback.count({
        where: {
          userId: userId,
          createdAt: { gte: thisWeekStart },
        },
      }),
      prisma.feedback.count({
        where: {
          userId: userId,
          createdAt: { gte: thisMonthStart },
        },
      }),
    ]);

    // Calculate XP needed for next level
    const currentLevel = user.level || 1;
    const xpForNextLevel = currentLevel * 1000; // Each level requires level * 1000 XP
    const currentXp = user.xp || 0;
    const xpProgress = Math.min(100, (currentXp / xpForNextLevel) * 100);

    // Calculate streak from recent feedbacks
    const recentFeedbacks = await prisma.feedback.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { createdAt: true },
    });

    let currentStreak = 0;
    if (recentFeedbacks.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (let i = 0; i < 30; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const hasActivity = recentFeedbacks.some((f) => {
          const feedbackDate = new Date(f.createdAt);
          feedbackDate.setHours(0, 0, 0, 0);
          return feedbackDate.getTime() === checkDate.getTime();
        });
        
        if (hasActivity) {
          currentStreak++;
        } else if (i > 0) {
          break;
        }
      }
    }

    const progressData = {
      userId: user.id,
      name: user.name,
      
      // Points & Level
      totalPoints: user.points || 0,
      level: currentLevel,
      xp: currentXp,
      xpForNextLevel,
      xpProgress: Math.floor(xpProgress),
      
      // Counts
      feedbackCount: user._count.feedbacks,
      badgeCount: user._count.badges,
      questsCompleted: user._count.quests,
      
      // Streaks
      currentStreak,
      longestStreak: currentStreak, // Simplified
      
      // Time-based stats
      weeklyFeedbacks,
      monthlyFeedbacks,
      totalReferrals: 0,
      
      // Activity
      lastActivityAt: recentFeedbacks[0]?.createdAt || null,
      isActiveToday: recentFeedbacks.length > 0 
        ? new Date(recentFeedbacks[0].createdAt).toDateString() === new Date().toDateString()
        : false,
    };

    return NextResponse.json({
      success: true,
      data: progressData,
    });
  } catch (error) {
    console.error('Error fetching user progress:', error);
    return NextResponse.json(
      { success: false, error: 'İlerleme bilgisi alınamadı' },
      { status: 500 }
    );
  }
}

// Award badge to user
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { badgeId } = await request.json();
    const userId = session.user.id;

    // Check if badge exists
    const badge = await prisma.badge.findUnique({
      where: { id: badgeId },
    });

    if (!badge) {
      return NextResponse.json(
        { success: false, error: 'Badge not found' },
        { status: 404 }
      );
    }

    // Check if already earned
    const existingBadge = await prisma.userBadge.findUnique({
      where: {
        userId_badgeId: {
          userId,
          badgeId,
        },
      },
    });

    if (existingBadge) {
      return NextResponse.json(
        { success: false, error: 'Badge already earned' },
        { status: 400 }
      );
    }

    // Award badge
    const userBadge = await prisma.userBadge.create({
      data: {
        userId,
        badgeId,
      },
      include: {
        badge: true,
      },
    });

    // Award points for badge
    const badgePoints = (badge.requirement as { value?: number })?.value || 100;
    await prisma.user.update({
      where: { id: userId },
      data: {
        points: { increment: badgePoints },
        xp: { increment: Math.floor(badgePoints / 2) },
      },
    });

    // Create notification
    await prisma.notification.create({
      data: {
        userId,
        type: 'BADGE_EARNED',
        title: 'Yeni Rozet Kazandınız!',
        message: `"${badge.name}" rozetini kazandınız! +${badgePoints} puan`,
        data: {
          badgeId: badge.id,
          badgeName: badge.name,
          badgeIcon: badge.icon,
          points: badgePoints,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: userBadge,
      pointsEarned: badgePoints,
    });
  } catch (error) {
    console.error('Error awarding badge:', error);
    return NextResponse.json(
      { success: false, error: 'Rozet verilemedi' },
      { status: 500 }
    );
  }
}
