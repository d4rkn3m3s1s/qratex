import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { startOfWeekUTC } from '@/lib/timezone';
import { levelProgress } from '@/components/customer/m-ben-ilerleme/level';
import { getActivityStreak } from '@/lib/quests/activity-streak';


export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('gamification.progress.read', auth.session.user.id, 'read');
    if (limited) return limited;
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
            feedbacks: { where: { deletedAt: null } },
            badges: true,
            quests: { where: { completedAt: { not: null } } },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Kullanıcı bulunamadı' },
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

    const [weeklyFeedbacks, monthlyFeedbacks, totalReferrals] = await Promise.all([
      prisma.feedback.count({
        where: {
          deletedAt: null,
          userId: userId,
          createdAt: { gte: thisWeekStart },
        },
      }),
      prisma.feedback.count({
        where: {
          deletedAt: null,
          userId: userId,
          createdAt: { gte: thisMonthStart },
        },
      }),
      prisma.referral.count({ where: { referrerId: userId, status: 'COMPLETED' } }),
    ]);

    // Seviye ilerlemesi yazan akışla (creditPointsAndXp → calculateLevel) AYNI geometrik eğri;
    // eskiden "seviye × 1000 XP" ile kümülatif XP bölünüyordu (Seviye 2'den sonra yanlış yüzde).
    // Seri: QR geri bildirimi + tüketim yorumu, İstanbul günü (görev ekranının seri alevi ile aynı
    // modül); eskiden yalnız QR yorumu, UTC günü ve `longestStreak = currentStreak` uydurmasıydı.
    const lp = levelProgress(user.xp || 0, user.level);
    const [streak, lastFeedback] = await Promise.all([
      getActivityStreak(prisma, userId),
      prisma.feedback.findFirst({
        where: { deletedAt: null, userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const progressData = {
      userId: user.id,
      name: user.name,
      
      // Points & Level
      totalPoints: user.points || 0,
      level: lp.level,
      xp: lp.xp,
      /** Sonraki seviyenin başladığı kümülatif XP. */
      xpForNextLevel: lp.nextLevelXp,
      xpToNextLevel: lp.xpToNext,
      xpProgress: lp.percent,
      
      // Counts
      feedbackCount: user._count.feedbacks,
      badgeCount: user._count.badges,
      questsCompleted: user._count.quests,
      
      // Seri (İstanbul günü, son 60 gün penceresi)
      currentStreak: streak.current,
      longestStreak: streak.bestInWindow,
      streakAtRisk: streak.atRisk,
      
      // Time-based stats
      weeklyFeedbacks,
      monthlyFeedbacks,
      totalReferrals,

      // Activity
      lastActivityAt: lastFeedback?.createdAt ?? null,
      isActiveToday: streak.activeToday,
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
