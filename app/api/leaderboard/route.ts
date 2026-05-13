import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { isSuspiciousPoints } from '@/lib/points-velocity';
import {
  getLeagueRules,
  getLeagueMetaFromRules,
  getLeagueProgressFromRules,
  getNextLeagueMetaFromRules,
} from '@/lib/league-rules';
import { assertModuleEnabled } from '@/lib/module-gate';

export const dynamic = 'force-dynamic';
/** Points dışı kategorilerde tek seferde en fazla kaç kullanıcı çekileceği (bellek/DoS önlemi) */
const MAX_LEADERBOARD_FETCH = 5000;

export async function GET(request: NextRequest) {
  try {
    const gate = await assertModuleEnabled('rewards');
    if (gate) return gate;
    const session = await getServerSession(authOptions);
    const leagueRules = await getLeagueRules();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'weekly';
    const category = searchParams.get('category') || 'points';
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

    const getCategoryLabel = () => {
      if (category === 'feedbacks') return 'Geri Bildirim';
      if (category === 'badges') return 'Rozet';
      if (category === 'referrals') return 'Davet';
      return 'Puan';
    };

    const getScoreFromUser = (user: {
      points: number;
      _count: { feedbacks: number; badges: number; referralsMade: number };
    }) => {
      if (category === 'feedbacks') return user._count.feedbacks;
      if (category === 'badges') return user._count.badges;
      if (category === 'referrals') return user._count.referralsMade;
      return user.points;
    };

    if (category !== 'points') {
      const orderBy =
        category === 'feedbacks'
          ? { feedbacks: { _count: 'desc' as const } }
          : category === 'badges'
            ? { badges: { _count: 'desc' as const } }
            : { referralsMade: { _count: 'desc' as const } };

      const [allUsers, totalUsersCount] = await Promise.all([
        prisma.user.findMany({
          where: { role: 'CUSTOMER' },
          orderBy,
          take: MAX_LEADERBOARD_FETCH,
          select: {
            id: true,
            name: true,
            image: true,
            points: true,
            level: true,
            _count: {
              select: {
                feedbacks: true,
                badges: true,
                referralsMade: true,
              },
            },
          },
        }),
        prisma.user.count({ where: { role: 'CUSTOMER' } }),
      ]);

      const sortedUsers = allUsers
        .map((user) => {
          const league = getLeagueMetaFromRules(user.points, leagueRules);
          const nextLeague = getNextLeagueMetaFromRules(user.points, leagueRules);
          const score = getScoreFromUser(user);
          return {
            id: user.id,
            name: user.name,
            image: user.image,
            points: user.points,
            score,
            level: user.level,
            feedbackCount: user._count.feedbacks,
            badgeCount: user._count.badges,
            referralCount: user._count.referralsMade,
            league: league.name,
            leagueKey: league.key,
            leagueProgress: getLeagueProgressFromRules(user.points, leagueRules),
            nextLeague: nextLeague?.name || null,
            pointsToNextLeague: nextLeague ? Math.max(0, nextLeague.minPoints - user.points) : 0,
          };
        })
        .sort((a, b) => b.score - a.score);

      const suspiciousIds = new Set<string>();
      await Promise.all(
        sortedUsers.slice(0, limit).map(async (u) => {
          const suspicious = await isSuspiciousPoints(u.id);
          if (suspicious) suspiciousIds.add(u.id);
        })
      );

      const leaderboard = sortedUsers.slice(0, limit).map((user, index) => ({
        ...user,
        rank: index + 1,
        isCurrentUser: session?.user?.id === user.id,
        needsReview: suspiciousIds.has(user.id),
      }));

      const userRank =
        session?.user?.id
          ? (sortedUsers.findIndex((u) => u.id === session.user.id) ?? -1) + 1 || null
          : null;
      const totalUsers = totalUsersCount;

      return NextResponse.json(
        {
          success: true,
          data: {
            leaderboard,
            userRank,
            currentUser: null,
            period,
            totalUsers,
            category,
            categoryLabel: getCategoryLabel(),
            periodLabel: period === 'weekly' ? 'Bu Hafta' : period === 'monthly' ? 'Bu Ay' : 'Tüm Zamanlar',
          },
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'weekly':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'alltime':
      default:
        startDate = new Date(0);
        break;
    }

    // For weekly/monthly, calculate points earned in that period from feedbacks
    let leaderboardData;

    if (period === 'alltime') {
      // All time - just use user points directly
      const users = await prisma.user.findMany({
        where: {
          role: 'CUSTOMER',
          points: { gt: 0 },
        },
        select: {
          id: true,
          name: true,
          image: true,
          points: true,
          level: true,
          xp: true,
          _count: {
            select: { feedbacks: true, badges: true, referralsMade: true },
          },
        },
        orderBy: { points: 'desc' },
        take: limit,
      });

      const suspiciousIds = new Set<string>();
      await Promise.all(users.map(async (u) => {
        if (await isSuspiciousPoints(u.id)) suspiciousIds.add(u.id);
      }));

      leaderboardData = users.map((user, index) => {
        const league = getLeagueMetaFromRules(user.points, leagueRules);
        const nextLeague = getNextLeagueMetaFromRules(user.points, leagueRules);
        return {
          id: user.id,
          name: user.name,
          image: user.image,
          points: user.points,
          level: user.level,
          rank: index + 1,
          feedbackCount: user._count.feedbacks,
          badgeCount: user._count.badges,
          league: league.name,
          leagueKey: league.key,
          leagueProgress: getLeagueProgressFromRules(user.points, leagueRules),
          nextLeague: nextLeague?.name || null,
          pointsToNextLeague: nextLeague ? Math.max(0, nextLeague.minPoints - user.points) : 0,
          isCurrentUser: session?.user?.id === user.id,
          needsReview: suspiciousIds.has(user.id),
        };
      });
    } else {
      // Weekly/Monthly - calculate points from feedbacks in the period
      const feedbackPoints = await prisma.feedback.groupBy({
        by: ['userId'],
        where: {
          createdAt: { gte: startDate },
          userId: { not: null },
        },
        _count: { id: true },
      });

      // En çok geri bildirim veren müşteriler (bellek / sorgu üst sınırı)
      const sortedPeriodContributors = [...feedbackPoints]
        .filter((f) => f.userId != null)
        .sort((a, b) => (b._count?.id ?? 0) - (a._count?.id ?? 0))
        .slice(0, MAX_LEADERBOARD_FETCH);
      const userIds = sortedPeriodContributors.map((f) => f.userId as string);

      if (userIds.length === 0) {
        const users = await prisma.user.findMany({
          where: {
            role: 'CUSTOMER',
            points: { gt: 0 },
          },
          select: {
            id: true,
            name: true,
            image: true,
            points: true,
            level: true,
            _count: {
              select: { feedbacks: true, badges: true, referralsMade: true },
            },
          },
          orderBy: { points: 'desc' },
          take: limit,
        });

        const fallbackSuspicious = new Set<string>();
        await Promise.all(users.map(async (u) => {
          if (await isSuspiciousPoints(u.id)) fallbackSuspicious.add(u.id);
        }));

        leaderboardData = users.map((user, index) => {
          const league = getLeagueMetaFromRules(user.points, leagueRules);
          const nextLeague = getNextLeagueMetaFromRules(user.points, leagueRules);
          return {
            id: user.id,
            name: user.name,
            image: user.image,
            points: user.points,
            level: user.level,
            rank: index + 1,
            feedbackCount: user._count.feedbacks,
            badgeCount: user._count.badges,
            league: league.name,
            leagueKey: league.key,
            leagueProgress: getLeagueProgressFromRules(user.points, leagueRules),
            nextLeague: nextLeague?.name || null,
            pointsToNextLeague: nextLeague ? Math.max(0, nextLeague.minPoints - user.points) : 0,
            isCurrentUser: session?.user?.id === user.id,
            needsReview: fallbackSuspicious.has(user.id),
          };
        });
      } else {
        // Get users with their period stats
        const users = await prisma.user.findMany({
          where: {
            id: { in: userIds },
            role: 'CUSTOMER',
          },
          select: {
            id: true,
            name: true,
            image: true,
            points: true,
            level: true,
            _count: {
              select: { feedbacks: true, badges: true, referralsMade: true },
            },
          },
          take: MAX_LEADERBOARD_FETCH,
        });

        // Calculate period points (each feedback = points based on text length)
        const periodFeedbacks = await prisma.feedback.findMany({
          where: {
            createdAt: { gte: startDate },
            userId: { in: userIds },
          },
          select: {
            userId: true,
            text: true,
          },
          take: 100000,
        });

        const periodPointsMap = new Map<string, number>();
        periodFeedbacks.forEach(f => {
          if (f.userId) {
            const points = f.text && f.text.length > 50 ? 100 : 50;
            periodPointsMap.set(f.userId, (periodPointsMap.get(f.userId) || 0) + points);
          }
        });

        // Sort by period points
        const sortedUsers = users
          .map(user => ({
            ...user,
            periodPoints: periodPointsMap.get(user.id) || 0,
          }))
          .sort((a, b) => b.periodPoints - a.periodPoints)
          .slice(0, limit);

        const suspiciousIdsPeriod = new Set<string>();
        await Promise.all(sortedUsers.map(async (u) => {
          if (await isSuspiciousPoints(u.id)) suspiciousIdsPeriod.add(u.id);
        }));

        leaderboardData = sortedUsers.map((user, index) => {
          const league = getLeagueMetaFromRules(user.points, leagueRules);
          const nextLeague = getNextLeagueMetaFromRules(user.points, leagueRules);
          return {
            id: user.id,
            name: user.name,
            image: user.image,
            points: user.periodPoints,
            totalPoints: user.points,
            level: user.level,
            rank: index + 1,
            feedbackCount: user._count.feedbacks,
            badgeCount: user._count.badges,
            league: league.name,
            leagueKey: league.key,
            leagueProgress: getLeagueProgressFromRules(user.points, leagueRules),
            nextLeague: nextLeague?.name || null,
            pointsToNextLeague: nextLeague ? Math.max(0, nextLeague.minPoints - user.points) : 0,
            isCurrentUser: session?.user?.id === user.id,
            needsReview: suspiciousIdsPeriod.has(user.id),
          };
        });
      }
    }

    // Get current user's rank if not in top list
    let userRank = null;
    let currentUserData = null;

    if (session?.user?.id) {
      const userIndex = leaderboardData.findIndex(u => u.id === session.user.id);
      
      if (userIndex === -1) {
        // Count users with more points
        const currentUser = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            id: true,
            name: true,
            image: true,
            points: true,
            level: true,
            _count: {
              select: { feedbacks: true, badges: true, referralsMade: true },
            },
          },
        });

        if (currentUser) {
          const usersAbove = await prisma.user.count({
            where: {
              role: 'CUSTOMER',
              points: { gt: currentUser.points },
            },
          });
          userRank = usersAbove + 1;
          const league = getLeagueMetaFromRules(currentUser.points, leagueRules);
          const nextLeague = getNextLeagueMetaFromRules(currentUser.points, leagueRules);
          currentUserData = {
            ...currentUser,
            rank: userRank,
            feedbackCount: currentUser._count.feedbacks,
            badgeCount: currentUser._count.badges,
            league: league.name,
            leagueKey: league.key,
            leagueProgress: getLeagueProgressFromRules(currentUser.points, leagueRules),
            nextLeague: nextLeague?.name || null,
            pointsToNextLeague: nextLeague ? Math.max(0, nextLeague.minPoints - currentUser.points) : 0,
          };
        }
      } else {
        userRank = userIndex + 1;
      }
    }

    const totalUsers = await prisma.user.count({ where: { role: 'CUSTOMER' } });

    return NextResponse.json(
      {
        success: true,
        data: {
          leaderboard: leaderboardData,
          userRank,
          currentUser: currentUserData,
          period,
          category,
          categoryLabel: getCategoryLabel(),
          totalUsers,
          periodLabel: period === 'weekly' ? 'Bu Hafta' : period === 'monthly' ? 'Bu Ay' : 'Tüm Zamanlar',
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Leaderboard error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, error: 'Liderlik tablosu yüklenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

