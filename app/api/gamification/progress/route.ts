import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { startOfDayUTC, startOfWeekUTC } from '@/lib/timezone';


export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

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
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Calculate additional stats — UTC sınırları (lib/timezone tek kaynak; yerel
    // setHours/setDate sunucu TZ'ine göre kayar ve ay başında hafta sınırını yanlış
    // önceki aya taşırdı).
    const nowForStats = new Date();
    const thisWeekStart = startOfWeekUTC(nowForStats);
    const thisMonthStart = new Date(
      Date.UTC(nowForStats.getUTCFullYear(), nowForStats.getUTCMonth(), 1)
    );

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
      // UTC gün sınırları — yerel setHours ay/gün geçişlerinde streak'i yanlış
      // sıfırlıyordu. Aktivite günlerini UTC gün damgasına indirgeyip karşılaştır.
      const activityDays = new Set(
        recentFeedbacks.map((f) => startOfDayUTC(new Date(f.createdAt)).getTime())
      );
      const todayUTC = startOfDayUTC(new Date());

      for (let i = 0; i < 30; i++) {
        const checkDay = todayUTC.getTime() - i * 24 * 60 * 60 * 1000;
        if (activityDays.has(checkDay)) {
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

    return NextResponse.json(
      {
        success: true,
        data: progressData,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error fetching user progress:', error);
    return NextResponse.json(
      { success: false, error: 'İlerleme bilgisi alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

// Award badge to user
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { badgeId } = await request.json();
    const userId = session.user.id;

    // Check if badge exists
    const badge = await prisma.badge.findUnique({
      where: { id: badgeId },
    });

    if (!badge) {
      return NextResponse.json(
        { success: false, error: 'Badge not found' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
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
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
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

    // Award points for badge — creditPointsAndXp ile (level'ı doğru günceller;
    // önceden raw increment level sınırını geçen XP'de level atlatmıyordu).
    const badgePoints = (badge.requirement as { value?: number })?.value || 100;
    await creditPointsAndXp(prisma, {
      userId,
      points: badgePoints,
      xp: Math.floor(badgePoints / 2),
    });

    // Anti-fraud görünürlüğü: kredilenen puanı points_credited olarak işle.
    if (badgePoints > 0) {
      await prisma.analyticsEvent.create({
        data: { userId, event: 'points_credited', category: 'badge', data: { points: badgePoints, badgeId: badge.id } },
      });
    }

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

    return NextResponse.json(
      {
        success: true,
        data: userBadge,
        pointsEarned: badgePoints,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error awarding badge:', error);
    return NextResponse.json(
      { success: false, error: 'Rozet verilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
