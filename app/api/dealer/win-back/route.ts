import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getWinBackOfferMessageTr, isWinBackOfferId } from '@/lib/dealer/win-back-offers';


export const dynamic = 'force-dynamic';

/** Win-back listesi: tüm müşteri groupBy belleğe sığmasın */
const WIN_BACK_RADAR_LIMIT = 500;
/** POST ile tek seferde en fazla bildirim */
const WIN_BACK_POST_MAX = 100;

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'DEALER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const dealerId = session.user.id;

        // Find "sleeping" customers: Users who have consumed here before but not in the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Uyuyan müşteriler + GERÇEK geçmiş ortalama harcamaları (tahmini gelir için).
        // avgSpend: bu müşterinin bu işletmedeki amount'u olan tüketimlerinin ortalaması.
        const sleepingRows = await prisma.$queryRaw<Array<{ customerId: string; lastVisit: Date; avgSpend: number | null }>>(
            Prisma.sql`
                SELECT c."customerId",
                       MAX(c."createdAt") AS "lastVisit",
                       AVG(c."amount") FILTER (WHERE c."amount" IS NOT NULL) AS "avgSpend"
                FROM "Consumption" c
                WHERE c."dealerId" = ${dealerId}
                GROUP BY c."customerId"
                HAVING MAX(c."createdAt") < ${thirtyDaysAgo}
                ORDER BY MAX(c."createdAt") ASC
                LIMIT ${WIN_BACK_RADAR_LIMIT}
            `
        );

        const customerIds = sleepingRows.map((r) => r.customerId);
        const customerDetails =
            customerIds.length === 0
                ? []
                : await prisma.user.findMany({
                      where: { id: { in: customerIds } },
                      select: {
                          id: true,
                          name: true,
                          email: true,
                          image: true,
                      },
                  });

        const metaByCustomer = new Map(sleepingRows.map((r) => [r.customerId, r]));

        const radarData = customerDetails.map((user) => {
            const meta = metaByCustomer.get(user.id);
            return {
                ...user,
                lastVisit: meta?.lastVisit ?? null,
                avgSpend: meta?.avgSpend != null ? Math.round(Number(meta.avgSpend)) : null,
            };
        });

        // Tahmini geri kazanım geliri = uyuyan müşterilerin gerçek ortalama
        // harcamalarının toplamı (geçmiş veriye dayalı; sabit varsayım DEĞİL).
        const potentialRevenue = Math.round(
            radarData.reduce((sum, r) => sum + (r.avgSpend ?? 0), 0)
        );

        return NextResponse.json({
            data: radarData,
            count: radarData.length,
            potentialRevenue,
            // Hiç amount kaydı yoksa tahmin 0 olur; UI bunu "veri yetersiz" gösterebilir.
            potentialRevenueBasis: 'avg_historical_spend',
        }, { headers: PRIVATE_NO_STORE_HEADERS });

    } catch (error) {
        console.error('[WINBACK_API_ERROR]', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'DEALER') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const body = await req.json();
        const userIds = body.userIds as unknown;
        const offerType = body.offerType as string;
        const personalNoteRaw = body.personalNote;
        const personalNote =
            typeof personalNoteRaw === 'string' ? personalNoteRaw.trim().slice(0, 500) : '';

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return NextResponse.json({ error: 'No users selected' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const sanitized = [
            ...new Set(
                userIds
                    .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64)
                    .slice(0, WIN_BACK_POST_MAX)
            ),
        ];
        if (sanitized.length === 0) {
            return NextResponse.json({ error: 'Geçersiz kullanıcı listesi' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const eligibleRows = await prisma.consumption.findMany({
            where: { dealerId: session.user.id, customerId: { in: sanitized } },
            select: { customerId: true },
            distinct: ['customerId'],
        });
        const eligible = new Set(eligibleRows.map((r) => r.customerId));
        const targetIds = sanitized.filter((id) => eligible.has(id));
        if (targetIds.length === 0) {
            return NextResponse.json(
                { error: 'Seçilen kullanıcılar bu işletmede tüketim kaydına sahip değil.' },
                { status: 400 , headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        if (!offerType || typeof offerType !== 'string' || !isWinBackOfferId(offerType)) {
            return NextResponse.json({ error: 'Invalid offer type' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const offerLine = getWinBackOfferMessageTr(offerType);
        const baseMessage = `${session.user.name || 'Favori mekanınız'} size özel bir fırsat sundu: ${offerLine} Hemen geri dönün.`;
        const message = personalNote ? `${baseMessage}\n\n${personalNote}` : baseMessage;

        // IN A REAL APP: Trigger Push Notifications / Send Emails here using Novu, Resend, or AWS SNS.
        // E.g., await pushService.sendPromotion(userIds, `Sizi özledik! Bugün gelirseniz ${offerType} kazanacaksınız.`);

        // We simulate creating a targeted notification in the database
        const notifications = targetIds.map(userId => ({
            userId: userId,
            title: 'Sizi Özledik! 🎁',
            message,
            type: 'PROMOTION',
            isRead: false
        }));

        await prisma.notification.createMany({
            data: notifications
        });

        return NextResponse.json({ success: true, message: `${targetIds.length} kullanıcıya win-back kampanyası gönderildi.` }, { headers: PRIVATE_NO_STORE_HEADERS });

    } catch (error) {
        console.error('[WINBACK_SEND_ERROR]', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
