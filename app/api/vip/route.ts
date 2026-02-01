import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - Get VIP info for current user
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all VIP tiers
    const tiers = await (prisma as any).vIPTier.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });

    // Get user's current VIP status
    let vipStatus = await (prisma as any).userVIPStatus.findUnique({
      where: { userId: session.user.id },
      include: { tier: true },
    });

    // Get user's total points/spending
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { points: true },
    });

    // Auto-assign tier if not set or needs upgrade
    if (tiers.length > 0) {
      const eligibleTier = [...tiers]
        .reverse()
        .find((t: any) => (user?.points || 0) >= t.minPoints);

      if (eligibleTier) {
        if (!vipStatus || vipStatus.tierId !== eligibleTier.id) {
          vipStatus = await (prisma as any).userVIPStatus.upsert({
            where: { userId: session.user.id },
            update: {
              tierId: eligibleTier.id,
              lifetimePoints: user?.points || 0,
              upgradedAt: new Date(),
            },
            create: {
              userId: session.user.id,
              tierId: eligibleTier.id,
              lifetimePoints: user?.points || 0,
            },
            include: { tier: true },
          });

          // Notify user of tier change
          await prisma.notification.create({
            data: {
              userId: session.user.id,
              type: 'VIP_UPGRADE',
              title: 'VIP Seviye Yükseltme!',
              message: `Tebrikler! ${eligibleTier.name} seviyesine yükseldin!`,
            },
          });
        }
      }
    }

    // Calculate progress to next tier
    let nextTier = null;
    let progressToNext = 0;
    if (vipStatus?.tier) {
      const currentTierIndex = tiers.findIndex((t: any) => t.id === vipStatus.tier.id);
      if (currentTierIndex < tiers.length - 1) {
        nextTier = tiers[currentTierIndex + 1];
        const currentMin = vipStatus.tier.minPoints;
        const nextMin = nextTier.minPoints;
        const userPoints = user?.points || 0;
        progressToNext = Math.min(100, Math.round(((userPoints - currentMin) / (nextMin - currentMin)) * 100));
      }
    }

    return NextResponse.json({
      success: true,
      currentTier: vipStatus?.tier || null,
      vipStatus,
      allTiers: tiers,
      nextTier,
      progressToNext,
      currentPoints: user?.points || 0,
    });
  } catch (error) {
    console.error('Error fetching VIP info:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
