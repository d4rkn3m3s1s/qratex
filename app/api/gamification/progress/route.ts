import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { startOfDayUTC, startOfWeekUTC } from '@/lib/timezone';


export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
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

// POST (rozet verme) KALDIRILDI — P0-14. Gövdeden gelen `badgeId` ile koşulsuz rozet +
// `requirement.value` kadar puan basıyordu (self-award). İstemci çağıranı yoktu. Rozet artık
// yalnız sunucu servisinden verilir: `awardBadge` (lib/badges/award.ts). Bu uca gelen POST
// Next.js tarafından 405 ile reddedilir.
