import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');
    const category = searchParams.get('category');

    // If userId is 'me', use session user
    const userId = userIdParam === 'me' && session?.user?.id 
      ? session.user.id 
      : userIdParam;

    let where: Record<string, unknown> = { isActive: true };
    
    if (category) {
      where.category = category;
    }

    const badges = await prisma.badge.findMany({
      where,
      include: {
        _count: {
          select: { users: true },
        },
      },
      orderBy: [
        { rarity: 'desc' }, // legendary first
        { createdAt: 'desc' },
      ],
    });

    // Get user's progress data for calculating badge progress
    let userProgress = {
      feedbackCount: 0,
      totalPoints: 0,
      currentStreak: 0,
      longestStreak: 0,
      level: 1,
      referralCount: 0,
      questsCompleted: 0,
    };

    let userBadgeMap = new Map<string, Date>();

    if (userId) {
      // Get user's earned badges
      const userBadgesData = await prisma.userBadge.findMany({
        where: { userId },
      });
      userBadgeMap = new Map(userBadgesData.map((ub) => [ub.badgeId, ub.earnedAt]));

      // Get user's progress
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          points: true,
          level: true,
          xp: true,
          _count: {
            select: {
              feedbacks: true,
              quests: true,
              badges: true,
            },
          },
        },
      });

      if (user) {
        userProgress = {
          feedbackCount: user._count.feedbacks,
          totalPoints: user.points || 0,
          currentStreak: 0, // Would need to calculate from feedbacks
          longestStreak: 0,
          level: user.level || 1,
          referralCount: 0,
          questsCompleted: user._count.quests,
        };
      }
    }

    // Transform badges with progress calculation
    const transformedBadges = badges.map((badge) => {
      const requirement = badge.requirement as { type?: string; value?: number } | null;
      const targetValue = requirement?.value || 10;
      let currentValue = 0;
      let progress = 0;

      // Calculate progress based on requirement type
      switch (requirement?.type) {
        case 'feedback_count':
          currentValue = userProgress.feedbackCount;
          break;
        case 'points':
          currentValue = userProgress.totalPoints;
          break;
        case 'streak':
          currentValue = userProgress.currentStreak;
          break;
        case 'longest_streak':
          currentValue = userProgress.longestStreak;
          break;
        case 'level':
          currentValue = userProgress.level;
          break;
        case 'referral':
          currentValue = userProgress.referralCount;
          break;
        case 'quests':
          currentValue = userProgress.questsCompleted;
          break;
        default:
          currentValue = 0;
      }

      progress = Math.min(100, Math.floor((currentValue / targetValue) * 100));
      const isEarned = userBadgeMap.has(badge.id);

      return {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        category: badge.category,
        rarity: (badge.rarity || 'common').toUpperCase() as 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY',
        points: targetValue,
        requirement: badge.description,
        requirementType: requirement?.type,
        targetValue,
        currentValue: isEarned ? targetValue : currentValue,
        progress: isEarned ? 100 : progress,
        earned: isEarned,
        earnedAt: userBadgeMap.get(badge.id) || null,
        earnedCount: badge._count.users,
      };
    });

    // Sort: earned first, then by progress
    transformedBadges.sort((a, b) => {
      if (a.earned && !b.earned) return -1;
      if (!a.earned && b.earned) return 1;
      return b.progress - a.progress;
    });

    return NextResponse.json({ 
      success: true, 
      data: transformedBadges,
      userProgress,
    });
  } catch (error) {
    console.error('Error fetching badges:', error);
    return NextResponse.json(
      { success: false, error: 'Rozetler getirilemedi' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Create badge with proper schema mapping
    const badge = await prisma.badge.create({
      data: {
        name: body.name,
        description: body.description,
        icon: body.icon,
        category: body.category || 'general',
        rarity: (body.rarity || 'common').toLowerCase(),
        requirement: { type: 'custom', value: body.points || 100 },
        isActive: body.isActive ?? true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE_BADGE',
        entity: 'Badge',
        entityId: badge.id,
        newData: badge as object,
      },
    });

    return NextResponse.json({ success: true, data: badge });
  } catch (error) {
    console.error('Error creating badge:', error);
    return NextResponse.json(
      { success: false, error: 'Rozet oluşturulamadı' },
      { status: 500 }
    );
  }
}

