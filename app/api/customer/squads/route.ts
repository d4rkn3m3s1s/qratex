import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { assertModuleEnabled } from '@/lib/module-gate';


export const dynamic = 'force-dynamic';

const FREEZE_KEY = 'admin_frozen_squads';

// Create a new Squad
export async function POST(req: Request) {
    try {
        const gate = await assertModuleEnabled('squads');
        if (gate) return gate;
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'CUSTOMER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { name } = await req.json();

        if (!name || name.length < 3) {
            return NextResponse.json({ error: 'Squad name must be at least 3 characters' }, { status: 400 });
        }

        const [existingOwnedSquad, existingMembership, frozenRow] = await Promise.all([
            prisma.squad.findFirst({
                where: { ownerId: session.user.id }
            }),
            prisma.squadMember.findFirst({
                where: { userId: session.user.id },
                select: { squadId: true }
            }),
            prisma.settings.findUnique({
                where: { key: FREEZE_KEY },
                select: { value: true }
            })
        ]);

        const frozenIds = Array.isArray((frozenRow?.value as { squadIds?: unknown })?.squadIds)
            ? ((frozenRow?.value as { squadIds?: unknown[] }).squadIds as unknown[]).map(String)
            : [];

        if (existingOwnedSquad) {
            return NextResponse.json({ error: 'You already own a squad' }, { status: 400 });
        }

        if (existingMembership) {
            if (frozenIds.includes(existingMembership.squadId)) {
                return NextResponse.json({ error: 'Dondurulmuş bir squad üyesiyken yeni squad oluşturamazsınız' }, { status: 403 });
            }
            return NextResponse.json({ error: 'You must leave your current squad first' }, { status: 400 });
        }

        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        const newSquad = await prisma.squad.create({
            data: {
                name,
                ownerId: session.user.id,
                inviteCode,
                members: {
                    create: {
                        userId: session.user.id
                    }
                }
            },
            include: {
                members: { include: { user: { select: { name: true, image: true } } } }
            }
        });

        return NextResponse.json({ success: true, squad: newSquad });

    } catch (error) {
        console.error('[SQUAD_CREATE_ERROR]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// Get user's current squad
export async function GET(req: Request) {
    try {
        const gate = await assertModuleEnabled('squads');
        if (gate) return gate;
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'CUSTOMER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Find the squad the user is a member of
        const member = await prisma.squadMember.findFirst({
            where: { userId: session.user.id },
            include: {
                squad: {
                    include: {
                        members: {
                            include: {
                                user: { select: { id: true, name: true, image: true, points: true } }
                            }
                        },
                        owner: { select: { id: true, name: true } }
                    }
                }
            }
        });

        if (!member) {
            return NextResponse.json({ squad: null });
        }

        return NextResponse.json({ squad: member.squad });

    } catch (error) {
        console.error('[SQUAD_GET_ERROR]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
