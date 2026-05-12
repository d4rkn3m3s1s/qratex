import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { getWinBackOfferMessageTr, isWinBackOfferId } from '@/lib/dealer/win-back-offers';


export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'DEALER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const dealerId = session.user.id;

        // Find "sleeping" customers: Users who have consumed here before but not in the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Get all unique customers who visited this dealer
        const allCustomers = await prisma.consumption.groupBy({
            by: ['customerId'],
            where: { dealerId: dealerId },
            _max: { createdAt: true }
        });

        const sleepingCustomers = allCustomers.filter(c =>
            c._max.createdAt && c._max.createdAt < thirtyDaysAgo
        );

        // Fetch details for these sleeping customers
        const customerDetails = await prisma.user.findMany({
            where: {
                id: { in: sleepingCustomers.map(sc => sc.customerId) }
            },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
            }
        });

        // Merge last visit date
        const radarData = customerDetails.map(user => {
            const stats = sleepingCustomers.find(sc => sc.customerId === user.id);
            return {
                ...user,
                lastVisit: stats?._max.createdAt
            };
        });

        return NextResponse.json({
            data: radarData,
            count: radarData.length,
            potentialRevenue: radarData.length * 250 // Mock estimation
        });

    } catch (error) {
        console.error('[WINBACK_API_ERROR]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'DEALER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const userIds = body.userIds as unknown;
        const offerType = body.offerType as string;
        const personalNoteRaw = body.personalNote;
        const personalNote =
            typeof personalNoteRaw === 'string' ? personalNoteRaw.trim().slice(0, 500) : '';

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return NextResponse.json({ error: 'No users selected' }, { status: 400 });
        }

        if (!offerType || typeof offerType !== 'string' || !isWinBackOfferId(offerType)) {
            return NextResponse.json({ error: 'Invalid offer type' }, { status: 400 });
        }

        const offerLine = getWinBackOfferMessageTr(offerType);
        const baseMessage = `${session.user.name || 'Favori mekanınız'} size özel bir fırsat sundu: ${offerLine} Hemen geri dönün.`;
        const message = personalNote ? `${baseMessage}\n\n${personalNote}` : baseMessage;

        // IN A REAL APP: Trigger Push Notifications / Send Emails here using Novu, Resend, or AWS SNS.
        // E.g., await pushService.sendPromotion(userIds, `Sizi özledik! Bugün gelirseniz ${offerType} kazanacaksınız.`);

        // We simulate creating a targeted notification in the database
        const notifications = userIds.map(userId => ({
            userId: userId,
            title: 'Sizi Özledik! 🎁',
            message,
            type: 'PROMOTION',
            isRead: false
        }));

        await prisma.notification.createMany({
            data: notifications
        });

        return NextResponse.json({ success: true, message: `${userIds.length} kullanıcıya win-back kampanyası gönderildi.` });

    } catch (error) {
        console.error('[WINBACK_SEND_ERROR]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
