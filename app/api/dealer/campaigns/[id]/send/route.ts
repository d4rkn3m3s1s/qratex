import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { sendPushNotification } from '@/lib/push';
import { assertModuleEnabled } from '@/lib/module-gate';

// POST — send campaign to target segment via notifications

export const dynamic = 'force-dynamic';

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const gate = await assertModuleEnabled('campaigns');
        if (gate) return gate;
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;
        const { id } = await params;

        const campaign = await prisma.campaign.findUnique({ where: { id } });
        if (!campaign || campaign.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 });
        }
        if (campaign.status === 'sent') {
            return NextResponse.json({ error: 'Bu kampanya zaten gönderildi' }, { status: 400 });
        }

        // Get target customers based on segment
        const dealerId = auth.session.user.id;
        let customerIds: string[] = [];

        if (campaign.targetSegment === 'all') {
            const feedbacks = await prisma.feedback.findMany({
                where: { qrCode: { dealerId } },
                select: { userId: true },
                distinct: ['userId'],
            });
            customerIds = feedbacks.filter((f) => f.userId).map((f) => f.userId!);
        } else if (campaign.targetSegment === 'vip') {
            const vips = await prisma.userVIPStatus.findMany({
                select: { userId: true },
                take: 500,
            });
            customerIds = vips.map((v) => v.userId);
        } else if (campaign.targetSegment === 'risk') {
            // Customers with avg rating <= 2 in last 30 days
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const risky = await prisma.feedback.groupBy({
                by: ['userId'],
                where: { qrCode: { dealerId }, createdAt: { gte: thirtyDaysAgo }, userId: { not: null } },
                _avg: { rating: true },
                having: { rating: { _avg: { lte: 2 } } },
            });
            customerIds = risky.filter((r) => r.userId).map((r) => r.userId!);
        } else {
            // loyal/active: customers with 3+ feedbacks
            const active = await prisma.feedback.groupBy({
                by: ['userId'],
                where: { qrCode: { dealerId }, userId: { not: null } },
                _count: true,
                having: { userId: { _count: { gte: 3 } } },
            });
            customerIds = active.filter((a) => a.userId).map((a) => a.userId!);
        }

        if (customerIds.length === 0) {
            return NextResponse.json({ error: 'Hedef segmentte müşteri bulunamadı' }, { status: 400 });
        }

        // Create notifications for all target customers
        await prisma.notification.createMany({
            data: customerIds.map((userId) => ({
                userId,
                title: campaign.title,
                message: campaign.message,
                type: 'campaign',
            })),
        });

        // Send actual Web Push notifications if channel is notification
        if (campaign.channel === 'notification') {
            const pushPromises = customerIds.map(userId =>
                sendPushNotification(
                    userId,
                    campaign.title,
                    campaign.message,
                    '/customer/feedbacks',
                    '/icon512_rounded.png'
                )
            );
            // Execute all pushes without waiting for each one sequentially
            await Promise.allSettled(pushPromises);
        }

        // Mark campaign as sent
        await prisma.campaign.update({
            where: { id },
            data: { status: 'sent', sentAt: new Date(), sentCount: customerIds.length },
        });

        return NextResponse.json({ success: true, sentCount: customerIds.length });
    } catch (error) {
        console.error('Error sending campaign:', error);
        return NextResponse.json({ error: 'Kampanya gönderilemedi' }, { status: 500 });
    }
}
