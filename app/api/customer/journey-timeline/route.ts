import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const auth = await requireAuth(['CUSTOMER']);
        if ('error' in auth) return auth.error;
        const userId = auth.session.user.id;

        // Fetch user data
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { createdAt: true, points: true, level: true },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'Kullanıcı bulunamadı' },
                { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        // Fetch all possible events for the timeline
        const [feedbacks, badges, claims, consumptions, vipStatus] = await Promise.all([
            prisma.feedback.findMany({
                where: { userId },
                include: { qrCode: { select: { name: true, dealer: { select: { businessName: true } } } } },
                orderBy: { createdAt: 'desc' },
                take: 50,
            }),
            prisma.userBadge.findMany({
                where: { userId },
                include: { badge: { select: { name: true, description: true, icon: true } } },
                orderBy: { earnedAt: 'desc' },
                take: 50,
            }),
            prisma.userReward.findMany({
                where: { userId },
                include: { reward: { select: { name: true, icon: true } } },
                orderBy: { redeemedAt: 'desc' },
                take: 50,
            }),
            prisma.consumption.findMany({
                where: { card: { customerId: userId } },
                include: { product: { select: { name: true, category: { select: { icon: true } } } } },
                orderBy: { createdAt: 'desc' },
                take: 50,
            }),
            prisma.userVIPStatus.findUnique({
                where: { userId },
                include: { tier: { select: { name: true } } },
            }),
        ]);

        type TimelineEvent = {
            id: string;
            type: 'register' | 'feedback' | 'badge' | 'reward' | 'consumption' | 'vip';
            title: string;
            description: string;
            icon: string;
            date: string;
            color: string;
            metadata?: any;
        };

        const events: TimelineEvent[] = [];

        // 1. Account Creation
        events.push({
            id: 'register',
            type: 'register',
            title: 'QRATEX Ailesine Katıldın 🎉',
            description: 'Yolculuğun burada başladı!',
            icon: '🚀',
            date: user.createdAt.toISOString(),
            color: 'violet',
        });

        // 2. Feedbacks
        feedbacks.forEach((f: any) => {
            events.push({
                id: `fb_${f.id}`,
                type: 'feedback',
                title: `${f.qrCode?.dealer?.businessName || 'İşletme'} Ziyareti`,
                description: f.rating >= 4 ? `${f.rating} yıldız verdin, harika bir gün!` : `${f.rating} yıldız verdin.`,
                icon: '⭐',
                date: f.createdAt.toISOString(),
                color: 'amber',
                metadata: { rating: f.rating }
            });
        });

        // 3. Badges
        badges.forEach((b: any) => {
            events.push({
                id: `badge_${b.id}`,
                type: 'badge',
                title: 'Yeni Bir Rozet Kazandın!',
                description: `${b.badge.name} - ${b.badge.description}`,
                icon: b.badge.icon || '🏅',
                date: b.earnedAt.toISOString(),
                color: 'emerald',
            });
        });

        // 4. Reward Claims
        claims.forEach((c: any) => {
            events.push({
                id: `reward_${c.id}`,
                type: 'reward',
                title: 'Ödül Kullanıldı 🎁',
                description: `${c.reward.name} ödülünün tadını çıkardın.`,
                icon: c.reward.icon || '🎁',
                date: (c.claimedAt || c.redeemedAt).toISOString(),
                color: 'pink',
            });
        });

        // 5. Consumptions
        consumptions.forEach((c: any) => {
            events.push({
                id: `cons_${c.id}`,
                type: 'consumption',
                title: 'Yeni Tüketim',
                description: c.product ? `${c.product.name} siparişi verdin.` : 'Bir tüketim kaydı oluşturuldu.',
                icon: c.product?.category?.icon || '☕',
                date: c.createdAt.toISOString(),
                color: 'blue',
            });
        });

        // 6. VIP Status
        if (vipStatus) {
            events.push({
                id: `vip_${vipStatus.id}`,
                type: 'vip',
                title: 'VIP Lige Yükseldin 👑',
                description: `Artık ${vipStatus.tier.name} statüsündesin! Ayrıcalıkların tadını çıkar.`,
                icon: '👑',
                date: vipStatus.upgradedAt.toISOString(),
                color: 'amber',
            });
        }

        // Sort events chronologically (newest first)
        events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return NextResponse.json(
            {
                success: true,
                timeline: events,
                stats: {
                    totalFeedbacks: feedbacks.length,
                    totalBadges: badges.length,
                    level: user.level ?? 1,
                    points: user.points ?? 0,
                },
            },
            { headers: PRIVATE_NO_STORE_HEADERS }
        );
    } catch (error) {
        console.error('Journey timeline error:', error);
        return NextResponse.json(
            { error: 'Timeline yüklenemedi' },
            { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
        );
    }
}
