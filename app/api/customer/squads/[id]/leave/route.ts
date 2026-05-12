import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { assertModuleEnabled } from '@/lib/module-gate';


export const dynamic = 'force-dynamic';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const gate = await assertModuleEnabled('squads');
        if (gate) return gate;
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'CUSTOMER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const { id: squadId } = await context.params;

        const membership = await prisma.squadMember.findFirst({
            where: { userId, squadId },
            include: { squad: true }
        });

        if (!membership) {
            return NextResponse.json({ error: 'Not a member of this squad' }, { status: 400 });
        }

        if (membership.squad.ownerId === userId) {
            // Owner leaving: delete the whole squad
            await prisma.squad.delete({
                where: { id: squadId }
            });
        } else {
            // Just member leaving
            await prisma.squadMember.delete({
                where: { id: membership.id }
            });
        }

        return NextResponse.json({ success: true, message: 'Successfully left squad' });

    } catch (error) {
        console.error('[SQUAD_LEAVE_ERROR]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
