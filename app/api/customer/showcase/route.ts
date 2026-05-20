import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'CUSTOMER') {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const userId = session.user.id;

        // Fetch user's cosmetics (including backgrounds, frames, badges) and badges
        const [ownedCosmetics, ownedBadges, userDetails] = await Promise.all([
            prisma.userCosmetic.findMany({
                where: { userId },
                include: { cosmetic: true }
            }),
            prisma.userBadge.findMany({
                where: { userId },
                include: { badge: true }
            }),
            prisma.user.findUnique({
                where: { id: userId },
                select: { customFrameColor: true }
            })
        ]);

        return NextResponse.json({
            success: true,
            cosmetics: ownedCosmetics,
            badges: ownedBadges,
            customFrameColor: userDetails?.customFrameColor || null
        }, { headers: PRIVATE_NO_STORE_HEADERS });

    } catch (error) {
        console.error('[SHOWCASE_GET_ERROR]', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'CUSTOMER') {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const userId = session.user.id;
        const { pinnedBadgeIds = [], pinnedCosmeticIds = [] } = await req.json();

        // 1. Enforce max 4 pinned items total
        const totalPins = pinnedBadgeIds.length + pinnedCosmeticIds.length;
        if (totalPins > 4) {
            return NextResponse.json(
                { error: 'Vitrinde en fazla 4 öge sergilenebilir.' },
                { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        // 2. Validate ownership of badges and cosmetics
        const [validBadges, validCosmetics] = await Promise.all([
            prisma.userBadge.findMany({
                where: { userId, badgeId: { in: pinnedBadgeIds } }
            }),
            prisma.userCosmetic.findMany({
                where: { userId, cosmeticId: { in: pinnedCosmeticIds } }
            })
        ]);

        if (validBadges.length !== pinnedBadgeIds.length || validCosmetics.length !== pinnedCosmeticIds.length) {
            return NextResponse.json(
                { error: 'Geçersiz öge seçimi. Sadece sahip olduğunuz ögeleri sergileyebilirsiniz.' },
                { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        // 3. Update database: reset all pins for this user, then set the specified ones
        await prisma.$transaction([
            // Reset cosmetics
            prisma.userCosmetic.updateMany({
                where: { userId },
                data: { isPinned: false }
            }),
            // Reset badges
            prisma.userBadge.updateMany({
                where: { userId },
                data: { isPinned: false }
            }),
            // Pin selected cosmetics
            prisma.userCosmetic.updateMany({
                where: { userId, cosmeticId: { in: pinnedCosmeticIds } },
                data: { isPinned: true }
            }),
            // Pin selected badges
            prisma.userBadge.updateMany({
                where: { userId, badgeId: { in: pinnedBadgeIds } },
                data: { isPinned: true }
            })
        ]);

        // Trigger showcase master achievement
        const { advanceAchievementProgress } = await import('@/lib/achievements');
        await advanceAchievementProgress(userId, 'quest-showcase-master', totalPins, 'set');

        return NextResponse.json(
            { success: true, message: 'Vitrin başarıyla güncellendi!' },
            { headers: PRIVATE_NO_STORE_HEADERS }
        );

    } catch (error) {
        console.error('[SHOWCASE_POST_ERROR]', error);
        return NextResponse.json(
            { error: 'Vitrin güncellenirken bir hata oluştu.' },
            { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
        );
    }
}
