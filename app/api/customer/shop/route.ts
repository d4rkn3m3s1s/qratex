import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { debitPoints, InsufficientPointsError } from '@/lib/points-wallet';

// GET all available cosmetic items and the user's inventory

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'CUSTOMER') {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const userId = session.user.id;

        const [items, userInventory, user] = await Promise.all([
            prisma.cosmeticItem.findMany({
                where: { isActive: true },
                orderBy: { createdAt: 'desc' },
                take: 200,
            }),
            prisma.userCosmetic.findMany({
                where: { userId },
                orderBy: { acquiredAt: 'desc' },
                take: 300,
            }),
            prisma.user.findUnique({ where: { id: userId }, select: { points: true, customFrameColor: true } }),
        ]);

        // Format items with ownership status
        const shopItems = items.map(item => {
            const owned = userInventory.find(inv => inv.cosmeticId === item.id);
            return {
                ...item,
                isOwned: !!owned,
                isEquipped: owned?.isEquipped || false
            };
        });

        return NextResponse.json(
            {
                items: shopItems,
                userPoints: user?.points || 0,
                customFrameColor: user?.customFrameColor || null,
            },
            { headers: PRIVATE_NO_STORE_HEADERS }
        );

    } catch (error) {
        console.error('[SHOP_GET_ERROR]', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
        );
    }
}

// POST to purchase an item
export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'CUSTOMER') {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const { itemId } = await req.json();

        if (!itemId) {
            return NextResponse.json(
                { error: 'Item ID required' },
                { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const userId = session.user.id;

        const [item, user, alreadyOwned] = await Promise.all([
            prisma.cosmeticItem.findUnique({ where: { id: itemId } }),
            prisma.user.findUnique({ where: { id: userId }, select: { points: true } }),
            prisma.userCosmetic.findFirst({ where: { userId, cosmeticId: itemId } })
        ]);

        if (!item) {
            return NextResponse.json(
                { error: 'Item not found' },
                { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }
        if (alreadyOwned) {
            return NextResponse.json(
                { error: 'Already own this item' },
                { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }
        if ((user?.points || 0) < item.price) {
            return NextResponse.json(
                { error: 'Not enough points' },
                { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        // Atomik harcama: guarded decrement (debitPoints) — eşzamanlı iki satın alma
        // aynı bakiyeyi görüp ikisi de düşürmesin (çift harcama / eksi bakiye).
        const { advanceAchievementProgress } = await import('@/lib/achievements');
        try {
            await prisma.$transaction(async (tx) => {
                await debitPoints(tx, { userId, points: item.price });
                await tx.userCosmetic.create({
                    data: { userId, cosmeticId: itemId, isEquipped: false },
                });
            });
        } catch (err) {
            if (err instanceof InsufficientPointsError) {
                return NextResponse.json(
                    { error: 'Not enough points' },
                    { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
                );
            }
            throw err;
        }

        await advanceAchievementProgress(userId, 'quest-cosmetic-collector', 1, 'increment');

        return NextResponse.json(
            { success: true, message: `Successfully purchased ${item.name}` },
            { headers: PRIVATE_NO_STORE_HEADERS }
        );

    } catch (error) {
        console.error('[SHOP_BUY_ERROR]', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
        );
    }
}
