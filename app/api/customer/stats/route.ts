import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth(['CUSTOMER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const userId = session.user.id;

    // Core queries (always work)
    const [user, feedbackCount, badgeCount, questProgress, recentFeedbacks, earnedBadges] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, image: true, points: true, xp: true, level: true, createdAt: true },
      }),
      prisma.feedback.count({ where: { userId } }),
      prisma.userBadge.count({ where: { userId } }),
      prisma.userQuest.findMany({
        where: { userId, completedAt: null },
        include: { quest: true },
        take: 5,
      }),
      prisma.feedback.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { qrCode: { select: { name: true, dealer: { select: { businessName: true } } } } },
      }),
      prisma.userBadge.findMany({
        where: { userId },
        orderBy: { earnedAt: 'desc' },
        take: 6,
        include: { badge: true },
      }),
    ]);

    // Card system queries (with fallback)
    let cardSystemData = {
      cards: [] as any[],
      consumptionCount: 0,
      consumptionReviewCount: 0,
      recentConsumptions: [] as any[],
    };
    
    try {
      const [userCards, consumptionCount, consumptionReviewCount, recentConsumptions] = await Promise.all([
        prisma.physicalCard.findMany({
          where: { customerId: userId, status: 'ACTIVATED' },
          select: { id: true, token: true, activatedAt: true, _count: { select: { consumptions: true } } },
        }),
        prisma.consumption.count({ where: { customerId: userId } }),
        prisma.consumptionReview.count({ where: { customerId: userId } }),
        prisma.consumption.findMany({
          where: { customerId: userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            dealer: { select: { businessName: true, name: true } },
            product: { select: { name: true, category: { select: { icon: true } } } },
            review: { select: { id: true, rating: true } },
          },
        }),
      ]);
      
      cardSystemData = { cards: userCards, consumptionCount, consumptionReviewCount, recentConsumptions };
    } catch (e) {
      console.log('Card system not available:', e);
    }

    if (!user) {
      return NextResponse.json({ success: false, error: 'Kullanıcı bulunamadı' }, { status: 404 });
    }

    // Calculate level progress
    const xpForCurrentLevel = (user.level - 1) * 1000;
    const xpForNextLevel = user.level * 1000;
    const xpProgress = user.xp - xpForCurrentLevel;
    const xpNeeded = xpForNextLevel - xpForCurrentLevel;
    const levelProgress = Math.min((xpProgress / xpNeeded) * 100, 100);

    // Format active quests
    const activeQuests = questProgress.map(uq => {
      const requirement = uq.quest.requirement as { count?: number } || {};
      const reward = uq.quest.reward as { points?: number; xp?: number } || {};
      return {
        id: uq.quest.id,
        name: uq.quest.name,
        description: uq.quest.description,
        icon: uq.quest.icon,
        type: uq.quest.type,
        progress: uq.progress,
        target: requirement.count || 1,
        reward: { points: reward.points || 50, xp: reward.xp || Math.floor((reward.points || 50) / 2) },
      };
    });

    // Format recent QR feedbacks
    const formattedQRFeedbacks = recentFeedbacks.map(f => ({
      id: f.id,
      business: f.qrCode.dealer?.businessName || f.qrCode.name,
      rating: f.rating,
      points: f.rating >= 4 ? 75 : 50,
      createdAt: f.createdAt,
      type: 'qr' as const,
    }));
    
    // Format recent consumptions
    const formattedConsumptions = cardSystemData.recentConsumptions.map((c: any) => ({
      id: c.id,
      business: c.dealer?.businessName || c.dealer?.name,
      product: c.product?.name,
      productIcon: c.product?.category?.icon,
      hasReview: !!c.review,
      rating: c.review?.rating,
      createdAt: c.createdAt,
      type: 'consumption' as const,
    }));
    
    // Combine and sort all recent activity
    const allRecentActivity = [...formattedQRFeedbacks, ...formattedConsumptions]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    // Format badges
    const formattedBadges = earnedBadges.map(ub => ({
      id: ub.badge.id,
      name: ub.badge.name,
      icon: ub.badge.icon,
      rarity: ub.badge.rarity.toLowerCase(),
      earnedAt: ub.earnedAt,
    }));
    
    // Pending reviews count
    const pendingReviewCount = cardSystemData.consumptionCount - cardSystemData.consumptionReviewCount;

    return NextResponse.json({
      success: true,
      data: {
        user: { ...user, levelProgress, xpProgress, xpNeeded },
        stats: {
          feedbackCount: feedbackCount + cardSystemData.consumptionReviewCount,
          badgeCount,
          points: user.points,
          level: user.level,
          streak: 0,
          cardCount: cardSystemData.cards.length,
          consumptionCount: cardSystemData.consumptionCount,
          consumptionReviewCount: cardSystemData.consumptionReviewCount,
          pendingReviewCount,
        },
        activeQuests,
        recentFeedbacks: formattedQRFeedbacks,
        recentActivity: allRecentActivity,
        badges: formattedBadges,
        cards: cardSystemData.cards.map((c: any) => ({
          id: c.id,
          token: c.token,
          activatedAt: c.activatedAt,
          consumptionCount: c._count?.consumptions || 0,
        })),
        recentConsumptions: formattedConsumptions,
      },
    }, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('Customer stats error:', error);
    return NextResponse.json({ success: false, error: 'İstatistikler yüklenemedi' }, { status: 500 });
  }
}
