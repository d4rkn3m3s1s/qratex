import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { sendPushNotification } from '@/lib/push';
import { assertModuleEnabled } from '@/lib/module-gate';

// POST — send campaign to target segment via notifications

export const dynamic = 'force-dynamic';

const MAX_CAMPAIGN_RECIPIENTS = 500;

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const gate = await assertModuleEnabled('campaigns');
        if (gate) return gate;
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;
        const { session } = auth;
        const { id } = await params;

        const campaign = await prisma.campaign.findUnique({ where: { id } });
        if (!campaign) {
            return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        if (session.user.role !== 'ADMIN' && campaign.dealerId !== session.user.id) {
            return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        if (campaign.status === 'sent') {
            return NextResponse.json({ error: 'Bu kampanya zaten gönderildi' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const dealerId = campaign.dealerId;
        let customerIds: string[] = [];

        if (campaign.targetSegment === 'all') {
            const feedbacks = await prisma.feedback.findMany({
                where: { qrCode: { dealerId } },
                select: { userId: true },
                distinct: ['userId'],
                take: MAX_CAMPAIGN_RECIPIENTS,
            });
            customerIds = feedbacks.filter((f) => f.userId).map((f) => f.userId!);
        } else if (campaign.targetSegment === 'vip') {
            const feedbacks = await prisma.feedback.findMany({
                where: {
                    qrCode: { dealerId },
                    userId: { not: null },
                    user: { vipStatus: { isNot: null } },
                },
                select: { userId: true },
                distinct: ['userId'],
                take: MAX_CAMPAIGN_RECIPIENTS,
            });
            customerIds = feedbacks.map((f) => f.userId!);
        } else if (campaign.targetSegment === 'risk') {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const risky = await prisma.feedback.groupBy({
                by: ['userId'],
                where: { qrCode: { dealerId }, createdAt: { gte: thirtyDaysAgo }, userId: { not: null } },
                _avg: { rating: true },
                having: { rating: { _avg: { lte: 2 } } },
            });
            customerIds = risky
                .filter((r) => r.userId)
                .map((r) => r.userId!)
                .slice(0, MAX_CAMPAIGN_RECIPIENTS);
        } else {
            const active = await prisma.feedback.groupBy({
                by: ['userId'],
                where: { qrCode: { dealerId }, userId: { not: null } },
                _count: true,
                having: { userId: { _count: { gte: 3 } } },
            });
            customerIds = active
                .filter((a) => a.userId)
                .map((a) => a.userId!)
                .slice(0, MAX_CAMPAIGN_RECIPIENTS);
        }

        customerIds = [...new Set(customerIds)].slice(0, MAX_CAMPAIGN_RECIPIENTS);

        if (customerIds.length === 0) {
            return NextResponse.json({ error: 'Hedef segmentte müşteri bulunamadı' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const markSentWhere =
            session.user.role === 'ADMIN'
                ? { id, status: { not: 'sent' as const } }
                : { id, dealerId: session.user.id, status: { not: 'sent' as const } };

        const claimed = await prisma.campaign.updateMany({
            where: markSentWhere,
            data: { status: 'sent', sentAt: new Date(), sentCount: customerIds.length },
        });
        if (claimed.count === 0) {
            return NextResponse.json(
                { error: 'Kampanya durumu değişti veya gönderilemedi' },
                { status: 409 , headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        await prisma.notification.createMany({
            data: customerIds.map((userId) => ({
                userId,
                title: campaign.title,
                message: campaign.message,
                type: 'campaign',
            })),
        });

        if (campaign.channel === 'notification') {
            const pushPromises = customerIds.map((userId) =>
                sendPushNotification(
                    userId,
                    campaign.title,
                    campaign.message,
                    '/customer/feedbacks',
                    '/icon512_rounded.png'
                )
            );
            await Promise.allSettled(pushPromises);
        }

        return NextResponse.json({ success: true, sentCount: customerIds.length }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error sending campaign:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Kampanya gönderilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
