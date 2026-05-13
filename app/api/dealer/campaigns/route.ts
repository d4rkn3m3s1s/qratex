import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { z } from 'zod';
import { assertMenuItemVisible, assertModuleEnabled } from '@/lib/module-gate';


export const dynamic = 'force-dynamic';

const createSchema = z.object({
    title: z.string().min(1).max(200),
    message: z.string().min(1).max(5000),
    targetSegment: z.enum(['vip', 'loyal', 'active', 'risk', 'all']),
    channel: z.enum(['notification', 'email']).default('notification'),
});

// GET — list dealer's campaigns
export async function GET() {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;
        const menuGate = await assertMenuItemVisible('campaigns', 'dealer', {
            userId: auth.session.user.id,
            routeKey: '/dealer/campaigns',
        });
        if (menuGate) return menuGate;
        const gate = await assertModuleEnabled('campaigns', {
            role: 'dealer',
            userId: auth.session.user.id,
            routeKey: '/dealer/campaigns',
        });
        if (gate) return gate;

        const campaigns = await prisma.campaign.findMany({
            where: { dealerId: auth.session.user.id },
            orderBy: { createdAt: 'desc' },
            take: 300,
        });

        return NextResponse.json({ success: true, campaigns }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error fetching campaigns:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Kampanyalar yüklenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}

// POST — create a campaign
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;
        const menuGate = await assertMenuItemVisible('campaigns', 'dealer', {
            request,
            userId: auth.session.user.id,
            routeKey: '/dealer/campaigns',
        });
        if (menuGate) return menuGate;
        const gate = await assertModuleEnabled('campaigns', {
            role: 'dealer',
            request,
            userId: auth.session.user.id,
            routeKey: '/dealer/campaigns',
        });
        if (gate) return gate;

        const body = await request.json();
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const campaign = await prisma.campaign.create({
            data: {
                dealerId: auth.session.user.id,
                title: parsed.data.title,
                message: parsed.data.message,
                targetSegment: parsed.data.targetSegment,
                channel: parsed.data.channel,
            },
        });

        return NextResponse.json({ success: true, campaign }, { status: 201 , headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error creating campaign:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Kampanya oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
