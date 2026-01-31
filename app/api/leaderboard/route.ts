import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering - disable caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'weekly';
    const limit = parseInt(searchParams.get('limit') || '50');

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
            select: { feedbacks: true, badges: true },
          },
        },
        orderBy: { points: 'desc' },
        take: limit,
      });

      leaderboardData = users.map((user, index) => ({
        id: user.id,
        name: user.name,
        image: user.image,
        points: user.points,
        level: user.level,
        rank: index + 1,
        feedbackCount: user._count.feedbacks,
        badgeCount: user._count.badges,
        isCurrentUser: session?.user?.id === user.id,
      }));
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

      // Get user IDs who have feedbacks in period
      const userIds = feedbackPoints
        .filter(f => f.userId !== null)
        .map(f => f.userId as string);

      if (userIds.length === 0) {
        // Fallback to all-time if no activity in period
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
              select: { feedbacks: true, badges: true },
            },
          },
          orderBy: { points: 'desc' },
          take: limit,
        });

        leaderboardData = users.map((user, index) => ({
          id: user.id,
          name: user.name,
          image: user.image,
          points: user.points,
          level: user.level,
          rank: index + 1,
          feedbackCount: user._count.feedbacks,
          badgeCount: user._count.badges,
          isCurrentUser: session?.user?.id === user.id,
        }));
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
              select: { feedbacks: true, badges: true },
            },
          },
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

        leaderboardData = sortedUsers.map((user, index) => ({
          id: user.id,
          name: user.name,
          image: user.image,
          points: user.periodPoints, // Use period points for display
          totalPoints: user.points, // Keep total points too
          level: user.level,
          rank: index + 1,
          feedbackCount: user._count.feedbacks,
          badgeCount: user._count.badges,
          isCurrentUser: session?.user?.id === user.id,
        }));
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
              select: { feedbacks: true, badges: true },
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
          currentUserData = {
            ...currentUser,
            rank: userRank,
            feedbackCount: currentUser._count.feedbacks,
            badgeCount: currentUser._count.badges,
          };
        }
      } else {
        userRank = userIndex + 1;
      }
    }

    const totalUsers = await prisma.user.count({ where: { role: 'CUSTOMER' } });

    return NextResponse.json({
      success: true,
      data: {
        leaderboard: leaderboardData,
        userRank,
        currentUser: currentUserData,
        period,
        totalUsers,
        periodLabel: period === 'weekly' ? 'Bu Hafta' : period === 'monthly' ? 'Bu Ay' : 'Tüm Zamanlar',
      },
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return NextResponse.json(
      { success: false, error: 'Liderlik tablosu yüklenemedi' },
      { status: 500 }
    );
  }
}

