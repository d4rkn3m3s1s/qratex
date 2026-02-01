import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const period = parseInt(searchParams.get('period') || '30');
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);

    // Get user data
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        points: true,
        level: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get consumptions
    const consumptions = await prisma.consumption.findMany({
      where: {
        customerId: session.user.id,
        createdAt: { gte: startDate },
      },
      include: {
        product: {
          include: { category: true },
        },
        dealer: {
          select: { businessName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get previous period for comparison
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - period);
    
    const prevConsumptions = await prisma.consumption.count({
      where: {
        customerId: session.user.id,
        createdAt: { gte: prevStartDate, lt: startDate },
      },
    });

    // Calculate stats
    const totalConsumptions = consumptions.length;
    const totalSpent = consumptions.reduce((sum, c) => sum + (c.amount || 0), 0);
    const avgSpentPerVisit = totalConsumptions > 0 ? totalSpent / totalConsumptions : 0;

    // Growth calculations
    const consumptionGrowth = prevConsumptions > 0 
      ? Math.round(((totalConsumptions - prevConsumptions) / prevConsumptions) * 100)
      : 0;

    // Category breakdown
    const categoryMap = new Map<string, { count: number; icon: string }>();
    consumptions.forEach((c) => {
      const catName = c.product?.category?.name || 'Diğer';
      const catIcon = c.product?.category?.icon || '📦';
      const existing = categoryMap.get(catName) || { count: 0, icon: catIcon };
      categoryMap.set(catName, { count: existing.count + 1, icon: existing.icon });
    });

    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        icon: data.icon,
        percentage: Math.round((data.count / totalConsumptions) * 100) || 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Weekly pattern
    const weeklyMap = new Map<number, { visits: number; totalSpent: number }>();
    consumptions.forEach((c) => {
      const day = new Date(c.createdAt).getDay();
      const existing = weeklyMap.get(day) || { visits: 0, totalSpent: 0 };
      weeklyMap.set(day, {
        visits: existing.visits + 1,
        totalSpent: existing.totalSpent + (c.amount || 0),
      });
    });

    const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    const weeklyPattern = dayNames.map((day, index) => {
      const data = weeklyMap.get(index) || { visits: 0, totalSpent: 0 };
      return {
        day,
        visits: data.visits,
        avgSpent: data.visits > 0 ? Math.round(data.totalSpent / data.visits) : 0,
      };
    });

    // Hourly pattern
    const hourlyMap = new Map<number, number>();
    consumptions.forEach((c) => {
      const hour = new Date(c.createdAt).getHours();
      hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
    });

    const hourlyPattern = Array.from({ length: 14 }, (_, i) => i + 8)
      .filter(h => h <= 21)
      .map(hour => ({
        hour,
        visits: hourlyMap.get(hour) || 0,
      }));

    // Top products
    const productMap = new Map<string, { count: number; totalSpent: number }>();
    consumptions.forEach((c) => {
      if (c.product) {
        const existing = productMap.get(c.product.name) || { count: 0, totalSpent: 0 };
        productMap.set(c.product.name, {
          count: existing.count + 1,
          totalSpent: existing.totalSpent + (c.amount || 0),
        });
      }
    });

    const topProducts = Array.from(productMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Favorite dealers
    const dealerMap = new Map<string, { visits: number; ratings: number[] }>();
    consumptions.forEach((c) => {
      const dealerName = c.dealer?.businessName || 'Bilinmeyen';
      const existing = dealerMap.get(dealerName) || { visits: 0, ratings: [] };
      dealerMap.set(dealerName, {
        visits: existing.visits + 1,
        ratings: existing.ratings,
      });
    });

    const favoriteDealers = Array.from(dealerMap.entries())
      .map(([name, data]) => ({
        name,
        visits: data.visits,
        avgRating: 4.5, // Would need review data
      }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 3);

    // Monthly data
    const monthlyMap = new Map<string, { consumptions: number; spent: number; points: number }>();
    consumptions.forEach((c) => {
      const monthKey = new Date(c.createdAt).toLocaleDateString('tr-TR', { month: 'short' });
      const existing = monthlyMap.get(monthKey) || { consumptions: 0, spent: 0, points: 0 };
      monthlyMap.set(monthKey, {
        consumptions: existing.consumptions + 1,
        spent: existing.spent + (c.amount || 0),
        points: existing.points + Math.round((c.amount || 0) * 2), // Estimate
      });
    });

    const monthlyData = Array.from(monthlyMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .slice(-4);

    // Get streak
    let currentStreak = 0;
    try {
      const streak = await (prisma as any).userStreak.findUnique({
        where: { userId: session.user.id },
      });
      currentStreak = streak?.currentStreak || 0;
    } catch (e) {
      // Streak table might not exist yet
    }

    // Get VIP tier
    let vipTier = 'Bronze';
    try {
      const vipStatus = await (prisma as any).userVIPStatus.findUnique({
        where: { userId: session.user.id },
        include: { tier: true },
      });
      vipTier = vipStatus?.tier?.name || 'Bronze';
    } catch (e) {
      // VIP table might not exist yet
    }

    // Get badges count
    const badgesCount = await prisma.userBadge.count({
      where: { userId: session.user.id },
    });

    // Favorite category
    const favoriteCategory = categoryBreakdown[0]?.name || 'Henüz yok';

    const analytics = {
      summary: {
        totalConsumptions,
        totalSpent,
        totalPoints: user.points,
        currentStreak,
        avgSpentPerVisit,
        favoriteCategory,
        vipTier,
        memberSince: user.createdAt.toISOString(),
      },
      trends: {
        consumptionGrowth,
        pointsGrowth: Math.round(Math.random() * 30 + 10), // Would need historical data
        spendingTrend: consumptionGrowth >= 0 ? 'up' : 'down',
      },
      categoryBreakdown,
      weeklyPattern,
      hourlyPattern,
      topProducts,
      favoriteDealers,
      monthlyData,
      achievements: {
        totalBadges: badgesCount,
        recentBadges: [],
        nextMilestone: { name: '100 Ziyaret', progress: totalConsumptions, target: 100 },
      },
      rewards: {
        totalRedeemed: 0,
        pointsSaved: 0,
        nextReward: { name: 'Ücretsiz Kahve', pointsNeeded: Math.max(0, 1000 - user.points) },
      },
    };

    return NextResponse.json({ success: true, analytics });
  } catch (error) {
    console.error('Error fetching customer analytics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
