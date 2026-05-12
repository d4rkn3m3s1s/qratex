import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

// GET — export all personal data as JSON

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const auth = await requireAuth(['CUSTOMER', 'DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;
        const userId = auth.session.user.id;

        const [user, feedbacks, badges, rewards, notifications, analytics] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true, name: true, email: true, phone: true, image: true,
                    role: true, points: true, level: true, xp: true,
                    businessName: true, businessDesc: true, address: true,
                    preferredLanguage: true, createdAt: true, updatedAt: true,
                },
            }),
            prisma.feedback.findMany({
                where: { userId },
                select: { id: true, rating: true, text: true, sentiment: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 500,
            }),
            prisma.userBadge.findMany({
                where: { userId },
                select: { earnedAt: true, badge: { select: { name: true, description: true } } },
            }),
            prisma.userReward.findMany({
                where: { userId },
                select: { claimedAt: true, reward: { select: { name: true, description: true } } },
            }),
            prisma.notification.findMany({
                where: { userId },
                select: { id: true, title: true, message: true, type: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 200,
            }),
            prisma.analyticsEvent.findMany({
                where: { userId },
                select: { event: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 200,
            }),
        ]);

        const exportData = {
            exportedAt: new Date().toISOString(),
            profile: user,
            feedbacks,
            badges: badges.map((b) => ({ ...b.badge, earnedAt: b.earnedAt })),
            rewards: rewards.map((r) => ({ ...r.reward, claimedAt: r.claimedAt })),
            notifications,
            analyticsEvents: analytics,
        };

        return new NextResponse(JSON.stringify(exportData, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="qratex-data-export-${userId}.json"`,
            },
        });
    } catch (error) {
        console.error('Data export error:', error);
        return NextResponse.json({ error: 'Veri dışa aktarma başarısız' }, { status: 500 });
    }
}
