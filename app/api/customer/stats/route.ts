import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Giriş yapmalısınız' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Get user data with related info
    const [user, feedbackCount, badgeCount, questProgress, recentFeedbacks, earnedBadges] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          points: true,
          xp: true,
          level: true,
          createdAt: true,
        },
      }),
      prisma.feedback.count({
        where: { userId },
      }),
      prisma.userBadge.count({
        where: { userId },
      }),
      prisma.userQuest.findMany({
        where: { 
          userId,
          completedAt: null,
        },
        include: {
          quest: true,
        },
        take: 5,
      }),
      prisma.feedback.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          qrCode: {
            select: {
              name: true,
              dealer: {
                select: { businessName: true },
              },
            },
          },
        },
      }),
      prisma.userBadge.findMany({
        where: { userId },
        orderBy: { earnedAt: 'desc' },
        take: 6,
        include: {
          badge: true,
        },
      }),
    ]);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Kullanıcı bulunamadı' },
        { status: 404 }
      );
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
        reward: { 
          points: reward.points || 50, 
          xp: reward.xp || Math.floor((reward.points || 50) / 2) 
        },
      };
    });

    // Format recent feedbacks
    const formattedFeedbacks = recentFeedbacks.map(f => ({
      id: f.id,
      business: f.qrCode.dealer?.businessName || f.qrCode.name,
      rating: f.rating,
      points: f.rating >= 4 ? 75 : 50,
      createdAt: f.createdAt,
    }));

    // Format badges
    const formattedBadges = earnedBadges.map(ub => ({
      id: ub.badge.id,
      name: ub.badge.name,
      icon: ub.badge.icon,
      rarity: ub.badge.rarity.toLowerCase(),
      earnedAt: ub.earnedAt,
    }));

    return NextResponse.json({
      success: true,
      data: {
        user: {
          ...user,
          levelProgress,
          xpProgress,
          xpNeeded,
        },
        stats: {
          feedbackCount,
          badgeCount,
          points: user.points,
          level: user.level,
          streak: 0, // TODO: Add streak calculation
        },
        activeQuests,
        recentFeedbacks: formattedFeedbacks,
        badges: formattedBadges,
      },
    });
  } catch (error) {
    console.error('Customer stats error:', error);
    return NextResponse.json(
      { success: false, error: 'İstatistikler yüklenemedi' },
      { status: 500 }
    );
  }
}
