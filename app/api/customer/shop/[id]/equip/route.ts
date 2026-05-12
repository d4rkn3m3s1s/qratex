import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';


export const dynamic = 'force-dynamic';

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'CUSTOMER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const { id: itemId } = await context.params;

        const ownedItem = await prisma.userCosmetic.findFirst({
            where: { userId, cosmeticId: itemId },
            include: { cosmetic: true }
        });

        if (!ownedItem) {
            return NextResponse.json({ error: 'You do not own this item' }, { status: 400 });
        }

        const isCurrentlyEquipped = ownedItem.isEquipped;

        await prisma.$transaction(async (tx) => {
            if (!isCurrentlyEquipped) {
                // Unequip items of same type
                const sameTypeItems = await tx.userCosmetic.findMany({
                    where: { userId, cosmetic: { type: ownedItem.cosmetic.type } }
                });

                for (const item of sameTypeItems) {
                    await tx.userCosmetic.update({
                        where: { id: item.id },
                        data: { isEquipped: false }
                    });
                }
            }

            // Toggle current item
            await tx.userCosmetic.update({
                where: { id: ownedItem.id },
                data: { isEquipped: !isCurrentlyEquipped }
            });
        });

        return NextResponse.json({ success: true, message: isCurrentlyEquipped ? 'Unequipped' : 'Equipped' });

    } catch (error) {
        console.error('[SHOP_EQUIP_ERROR]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
