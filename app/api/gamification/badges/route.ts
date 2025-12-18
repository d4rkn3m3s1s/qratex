import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createBadgeSchema } from '@/lib/validations';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const category = searchParams.get('category');

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
      orderBy: [{ createdAt: 'desc' }],
    });

    // Transform to match frontend expected format
    const transformedBadges = badges.map((badge) => ({
      id: badge.id,
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      rarity: (badge.rarity || 'common').toUpperCase() as 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY',
      points: (badge.requirement as { value?: number })?.value || 100,
      requirement: badge.description,
      isActive: badge.isActive,
      _count: badge._count,
    }));

    // If userId provided, get user's earned badges
    if (userId && userId !== 'me') {
      const userBadges = await prisma.userBadge.findMany({
        where: { userId },
        select: { badgeId: true, earnedAt: true },
      });

      const userBadgeMap = new Map(
        userBadges.map((ub) => [ub.badgeId, ub.earnedAt])
      );

      const badgesWithStatus = transformedBadges.map((badge) => ({
        ...badge,
        earned: userBadgeMap.has(badge.id),
        earnedAt: userBadgeMap.get(badge.id) || null,
      }));

      return NextResponse.json({ success: true, data: badgesWithStatus });
    }

    return NextResponse.json({ success: true, data: transformedBadges });
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
        category: 'custom',
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

