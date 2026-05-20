import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/equipped-cosmetics
 * Returns the currently equipped frame and background imageUrl values
 * so the client can immediately update the JWT session after equipping.
 */
export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const equippedItems = await prisma.userCosmetic.findMany({
        where: { userId: session.user.id, isEquipped: true },
        select: { cosmetic: { select: { type: true, imageUrl: true } } },
    });

    const frame = equippedItems.find(i => i.cosmetic.type === 'avatar_frame');
    const background = equippedItems.find(i => i.cosmetic.type === 'profile_background');

    return NextResponse.json(
        {
            equippedFrame: frame?.cosmetic.imageUrl ?? null,
            equippedBackground: background?.cosmetic.imageUrl ?? null,
        },
        { headers: PRIVATE_NO_STORE_HEADERS }
    );
}
