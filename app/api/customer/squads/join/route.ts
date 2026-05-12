import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { assertModuleEnabled } from '@/lib/module-gate';


export const dynamic = 'force-dynamic';

const FREEZE_KEY = 'admin_frozen_squads';

export async function POST(req: Request) {
    try {
        const gate = await assertModuleEnabled('squads');
        if (gate) return gate;
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'CUSTOMER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { inviteCode } = await req.json();

        if (!inviteCode) {
            return NextResponse.json({ error: 'Invite code is required' }, { status: 400 });
        }

        // Find Squad by Invite Code
        const squadToJoin = await prisma.squad.findUnique({
            where: { inviteCode }
        });

        if (!squadToJoin) {
            return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
        }

        const frozenRow = await prisma.settings.findUnique({
            where: { key: FREEZE_KEY },
            select: { value: true },
        });
        const frozenIds = Array.isArray((frozenRow?.value as { squadIds?: unknown })?.squadIds)
            ? ((frozenRow?.value as { squadIds?: unknown[] }).squadIds as unknown[]).map(String)
            : [];
        if (frozenIds.includes(squadToJoin.id)) {
            return NextResponse.json({ error: 'Bu squad geçici olarak dondurulmuş' }, { status: 403 });
        }

        const userId = session.user.id;

        // Check if the user is already in a squad
        const existingMembership = await prisma.squadMember.findFirst({
            where: { userId }
        });

        if (existingMembership) {
            if (existingMembership.squadId === squadToJoin.id) {
                return NextResponse.json({ error: 'You are already in this squad' }, { status: 400 });
            }
            return NextResponse.json({ error: 'You must leave your current squad first' }, { status: 400 });
        }

        // Join the squad
        await prisma.squadMember.create({
            data: {
                userId,
                squadId: squadToJoin.id
            }
        });

        // Award minor bonus logic if desired

        return NextResponse.json({ success: true, message: `Successfully joined ${squadToJoin.name}` });

    } catch (error) {
        console.error('[SQUAD_JOIN_ERROR]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
