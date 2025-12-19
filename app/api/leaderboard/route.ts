import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

    // Get top users by points
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
      },
      orderBy: { points: 'desc' },
      take: limit,
    });

    // Add rank and calculate change (simplified - in production you'd store historical data)
    const leaderboard = users.map((user, index) => ({
      id: user.id,
      name: user.name,
      image: user.image,
      points: user.points,
      level: user.level,
      rank: index + 1,
      change: Math.floor(Math.random() * 5) - 2, // Simulated rank change
      isCurrentUser: session?.user?.id === user.id,
    }));

    // Get current user's rank if not in top list
    let userRank = null;
    if (session?.user?.id) {
      const userIndex = leaderboard.findIndex(u => u.id === session.user.id);
      if (userIndex === -1) {
        // Count users with more points
        const usersAbove = await prisma.user.count({
          where: {
            role: 'CUSTOMER',
            points: { gt: session.user.points || 0 },
          },
        });
        userRank = usersAbove + 1;
      } else {
        userRank = userIndex + 1;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        leaderboard,
        userRank,
        period,
        totalUsers: await prisma.user.count({ where: { role: 'CUSTOMER' } }),
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

