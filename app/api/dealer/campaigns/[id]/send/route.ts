import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { assertModuleEnabled } from '@/lib/module-gate';
import {
    EMAIL_CHANNEL_UNAVAILABLE_MESSAGE,
    buildMarketingNotificationRows,
    isSupportedCampaignChannel,
    resolveMarketingAudience,
    sendMarketingPush,
} from '@/lib/marketing-delivery';

/**
 * POST — kampanyayı hedef segmente gönderir.
 *
 * P0-35:
 *  - Alıcılar müşterinin "Kampanya & Sürprizler" bildirim tercihine göre süzülür (uygulama içi
 *    ve push ayrı ayrı); iki kanalı da kapatan müşteriye hiçbir şey gitmez.
 *  - Her bildirim `data.kind='campaign'` taşır.
 *  - Sahte "e-posta" kanalı: hiçbir e-posta gönderilmiyordu ve push da atlanıyordu → artık
 *    e-posta kanallı kampanya gönderilmez, bayiye açık bir hata gösterilir.
 *  - "Gönderildi" işareti ile uygulama içi bildirimler AYNI transaction'da yazılır: teslim
 *    başarısız olursa kampanya taslak kalır, yeniden denenebilir.
 */

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
        if (!isSupportedCampaignChannel(campaign.channel)) {
            return NextResponse.json(
                { error: EMAIL_CHANNEL_UNAVAILABLE_MESSAGE, code: 'CHANNEL_UNSUPPORTED' },
                { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const dealerId = campaign.dealerId;
        let customerIds: string[] = [];
        const activeFeedback = { qrCode: { dealerId }, deletedAt: null };

        if (campaign.targetSegment === 'all') {
            const feedbacks = await prisma.feedback.findMany({
                where: { ...activeFeedback, userId: { not: null } },
                select: { userId: true },
                distinct: ['userId'],
                take: MAX_CAMPAIGN_RECIPIENTS,
            });
            customerIds = feedbacks.filter((f) => f.userId).map((f) => f.userId!);
        } else if (campaign.targetSegment === 'vip') {
            const feedbacks = await prisma.feedback.findMany({
                where: {
                    ...activeFeedback,
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
                where: { ...activeFeedback, createdAt: { gte: thirtyDaysAgo }, userId: { not: null } },
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
                where: { ...activeFeedback, userId: { not: null } },
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

        // Bildirim tercihine saygı (fail-closed: tercih okunamazsa hiçbir şey gönderilmez).
        const audience = await resolveMarketingAudience(customerIds);
        if (audience.reachCount === 0) {
            return NextResponse.json(
                {
                    error: 'Hedef segmentteki müşterilerin tümü kampanya bildirimlerini kapatmış; gönderilecek kimse yok.',
                    code: 'NO_CONSENTING_RECIPIENTS',
                    candidateCount: audience.candidateCount,
                    optedOutCount: audience.optedOutCount,
                },
                { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const markSentWhere =
            session.user.role === 'ADMIN'
                ? { id, status: { not: 'sent' as const } }
                : { id, dealerId: session.user.id, status: { not: 'sent' as const } };

        // Claim + uygulama içi bildirimler tek transaction: biri başarısızsa ikisi de geri alınır.
        const claimed = await prisma.$transaction(async (tx) => {
            const claim = await tx.campaign.updateMany({
                where: markSentWhere,
                data: { status: 'sent', sentAt: new Date(), sentCount: audience.reachCount },
            });
            if (claim.count === 0) return false;
            if (audience.appUserIds.length > 0) {
                await tx.notification.createMany({
                    data: buildMarketingNotificationRows(audience.appUserIds, {
                        title: campaign.title,
                        message: campaign.message,
                        type: 'campaign',
                        data: { campaignId: campaign.id, dealerId },
                    }),
                });
            }
            return true;
        });
        if (!claimed) {
            return NextResponse.json(
                { error: 'Kampanya durumu değişti veya gönderilemedi' },
                { status: 409 , headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const pushDelivered = await sendMarketingPush(audience.pushUserIds, {
            title: campaign.title,
            message: campaign.message,
            url: '/customer',
        });

        return NextResponse.json(
            {
                success: true,
                sentCount: audience.reachCount,
                inAppCount: audience.appUserIds.length,
                pushDelivered,
                candidateCount: audience.candidateCount,
                optedOutCount: audience.optedOutCount,
                ineligibleCount: audience.ineligibleCount,
            },
            { headers: PRIVATE_NO_STORE_HEADERS }
        );
    } catch (error) {
        console.error('Error sending campaign:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Kampanya gönderilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
