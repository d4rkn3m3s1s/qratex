import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, clampTakeParam, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const ANALYTICS_PERIOD_DEFAULT = 30;
const ANALYTICS_PERIOD_MAX = 366;
/** Güvenlik / bellek: tek istekte işlenecek tüketim üst sınırı (istatistikler bu örneklem üzerinden). */
const ANALYTICS_MAX_CONSUMPTION_ROWS = 8_000;

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(req.url);
    const period = clampTakeParam(
      searchParams.get('period'),
      ANALYTICS_PERIOD_DEFAULT,
      ANALYTICS_PERIOD_MAX
    );
    
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
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const periodWhere = {
      customerId: session.user.id,
      createdAt: { gte: startDate },
    };

    const [consumptions, periodTotalCount, spentAgg] = await Promise.all([
      prisma.consumption.findMany({
        where: periodWhere,
        select: {
          id: true,
          createdAt: true,
          amount: true,
          note: true,
          product: {
            select: {
              id: true,
              name: true,
              category: {
                select: { id: true, name: true, icon: true },
              },
            },
          },
          dealer: {
            select: { id: true, businessName: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: ANALYTICS_MAX_CONSUMPTION_ROWS,
      }),
      prisma.consumption.count({ where: periodWhere }),
      prisma.consumption.aggregate({
        where: periodWhere,
        _sum: { amount: true },
      }),
    ]);

    const sampledCount = consumptions.length;
    const consumptionIds = consumptions.map((c) => c.id);
    const reviews = consumptionIds.length
      ? await prisma.consumptionReview.findMany({
          where: {
            customerId: session.user.id,
            consumptionId: { in: consumptionIds },
          },
          select: {
            consumptionId: true,
            rating: true,
          },
        })
      : [];
    const reviewByConsumptionId = new Map(reviews.map((r) => [r.consumptionId, r.rating]));

    // Get previous period for comparison
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - period);
    
    const prevConsumptions = await prisma.consumption.count({
      where: {
        customerId: session.user.id,
        createdAt: { gte: prevStartDate, lt: startDate },
      },
    });

    // Calculate stats (özet: dönem toplamları DB aggregate; dağılımlar en güncel örneklem üzerinden)
    const totalConsumptions = periodTotalCount;
    const totalSpent = spentAgg._sum.amount ?? 0;
    const avgSpentPerVisit = totalConsumptions > 0 ? totalSpent / totalConsumptions : 0;

    // Growth calculations
    const consumptionGrowth = prevConsumptions > 0
      ? Math.round(((totalConsumptions - prevConsumptions) / prevConsumptions) * 100)
      : 0;

    // GERÇEK puan büyümesi: bu dönem vs önceki dönem points_credited toplamları
    // (önceden Math.random ile uyduruluyordu).
    const sumCreditedPoints = (events: Array<{ data: unknown }>): number => {
      let sum = 0;
      for (const e of events) {
        const d = e.data as { points?: number } | null;
        if (d && typeof d.points === 'number') sum += d.points;
      }
      return sum;
    };
    // points_credited olayları artık oyun/görev/savaş kredilerini de içeriyor →
    // satır sayısı kullanıcı başına büyüyebilir. Sınırsız findMany yerine makul
    // bir tavanla (en yeni 20k) çek; bu, bir özet sayısı için fazlasıyla yeterli
    // ve bellekte sınırsız büyümeyi engeller (rank 15).
    const POINTS_EVENT_CAP = 20_000;
    const [pointsThisPeriodRows, pointsPrevPeriodRows] = await Promise.all([
      prisma.analyticsEvent.findMany({
        where: { userId: session.user.id, event: 'points_credited', createdAt: { gte: startDate } },
        select: { data: true },
        orderBy: { createdAt: 'desc' },
        take: POINTS_EVENT_CAP,
      }),
      prisma.analyticsEvent.findMany({
        where: { userId: session.user.id, event: 'points_credited', createdAt: { gte: prevStartDate, lt: startDate } },
        select: { data: true },
        orderBy: { createdAt: 'desc' },
        take: POINTS_EVENT_CAP,
      }),
    ]);
    const pointsThisPeriod = sumCreditedPoints(pointsThisPeriodRows);
    const pointsPrevPeriod = sumCreditedPoints(pointsPrevPeriodRows);
    const pointsGrowth = pointsPrevPeriod > 0
      ? Math.round(((pointsThisPeriod - pointsPrevPeriod) / pointsPrevPeriod) * 100)
      : (pointsThisPeriod > 0 ? 100 : 0);

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
        percentage:
          sampledCount > 0 ? Math.round((data.count / sampledCount) * 100) : 0,
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

    // Top products — ürünsüz tüketimler de görünsün: ürün adı yoksa not, o da
    // yoksa "Diğer" etiketiyle sayılır (önceden tamamen atlanıyordu → liste boştu).
    const productMap = new Map<string, { count: number; totalSpent: number }>();
    consumptions.forEach((c) => {
      const label = c.product?.name || (c.note && c.note.trim() !== '' ? c.note.trim() : 'Diğer');
      const existing = productMap.get(label) || { count: 0, totalSpent: 0 };
      productMap.set(label, {
        count: existing.count + 1,
        totalSpent: existing.totalSpent + (c.amount || 0),
      });
    });

    const topProducts = Array.from(productMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Favorite dealers
    const dealerMap = new Map<
      string,
      { dealerId: string; name: string; visits: number; ratings: number[]; hourlyVisits: Map<number, number> }
    >();
    consumptions.forEach((c) => {
      const dealerId = c.dealer?.id || 'unknown';
      const dealerName = c.dealer?.businessName || c.dealer?.name || 'Bilinmeyen';
      const existing = dealerMap.get(dealerId) || {
        dealerId,
        name: dealerName,
        visits: 0,
        ratings: [],
        hourlyVisits: new Map<number, number>(),
      };
      const hour = new Date(c.createdAt).getHours();
      const currentHourCount = existing.hourlyVisits.get(hour) || 0;
      const rating = reviewByConsumptionId.get(c.id);
      if (typeof rating === 'number') {
        existing.ratings.push(rating);
      }
      existing.hourlyVisits.set(hour, currentHourCount + 1);
      dealerMap.set(dealerId, {
        visits: existing.visits + 1,
        ratings: existing.ratings,
        hourlyVisits: existing.hourlyVisits,
        dealerId,
        name: dealerName,
      });
    });

    const favoriteDealers = Array.from(dealerMap.entries())
      .map(([, data]) => ({
        name: data.name,
        visits: data.visits,
        avgRating:
          data.ratings.length > 0
            ? Number((data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1))
            : 0,
      }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 3);

    const maxVisitsAmongDealers = Math.max(
      1,
      ...Array.from(dealerMap.values()).map((d) => d.visits)
    );
    const branchComparison = Array.from(dealerMap.values())
      .map((dealer) => {
        const peakHourVisits = Math.max(0, ...Array.from(dealer.hourlyVisits.values()));
        const loadFactor = dealer.visits / maxVisitsAmongDealers;
        const estimatedWaitMinutes = Math.round(6 + loadFactor * 8 + peakHourVisits * 1.5);
        const avgRating =
          dealer.ratings.length > 0
            ? Number((dealer.ratings.reduce((a, b) => a + b, 0) / dealer.ratings.length).toFixed(1))
            : 0;
        return {
          dealerId: dealer.dealerId,
          dealerName: dealer.name,
          visits: dealer.visits,
          avgRating,
          estimatedWaitMinutes,
        };
      })
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 5);

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
      const streak = await prisma.userStreak.findUnique({
        where: { userId: session.user.id },
      });
      currentStreak = streak?.currentStreak || 0;
    } catch (e) {
      // Streak table might not exist yet
    }

    // Get VIP tier
    let vipTier = 'Bronze';
    try {
      const vipStatus = await prisma.userVIPStatus.findUnique({
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
        pointsGrowth,
        spendingTrend: consumptionGrowth >= 0 ? 'up' : 'down',
      },
      categoryBreakdown,
      weeklyPattern,
      hourlyPattern,
      topProducts,
      favoriteDealers,
      branchComparison,
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

    return NextResponse.json({ success: true, analytics }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching customer analytics:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
