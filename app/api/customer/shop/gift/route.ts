import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'CUSTOMER') {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const senderId = session.user.id;
        const { cosmeticId, recipientIdentifier, message } = await req.json();

        if (!cosmeticId || !recipientIdentifier) {
            return NextResponse.json(
                { error: 'Kozmetik ID ve alıcı bilgisi (E-posta veya İsim) gereklidir.' },
                { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        // 1. Fetch cosmetic item details
        const cosmetic = await prisma.cosmeticItem.findUnique({
            where: { id: cosmeticId }
        });

        if (!cosmetic || !cosmetic.isActive) {
            return NextResponse.json(
                { error: 'Kozmetik öğesi bulunamadı veya aktif değil.' },
                { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        // 2. Fetch sender details
        const sender = await prisma.user.findUnique({
            where: { id: senderId },
            select: { name: true, email: true, points: true }
        });

        if (!sender) {
            return NextResponse.json(
                { error: 'Gönderici hesabı bulunamadı.' },
                { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        if (sender.points < cosmetic.price) {
            return NextResponse.json(
                { error: `Yetersiz puan. Bu hediye ${cosmetic.price} puan gerektiriyor, sizde ${sender.points} puan var.` },
                { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        // 3. Find recipient (case-insensitive for safety)
        const recipient = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: { equals: recipientIdentifier, mode: 'insensitive' } },
                    { name: { equals: recipientIdentifier, mode: 'insensitive' } }
                ],
                role: 'CUSTOMER'
            },
            select: { id: true, name: true, email: true }
        });

        if (!recipient) {
            return NextResponse.json(
                { error: 'Belirtilen kullanıcı (E-posta veya İsim) bulunamadı.' },
                { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        if (recipient.id === senderId) {
            return NextResponse.json(
                { error: 'Kendinize hediye gönderemezsiniz. Lütfen normal satın almayı kullanın.' },
                { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        // 4. Check if recipient already owns the cosmetic
        const alreadyOwned = await prisma.userCosmetic.findFirst({
            where: { userId: recipient.id, cosmeticId }
        });

        if (alreadyOwned) {
            return NextResponse.json(
                { error: 'Alıcı bu kozmetik öğesine zaten sahip.' },
                { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        // 5. Execute transaction (Deduct points, Create UserCosmetic, Send Notification)
        await prisma.$transaction(async (tx) => {
            // Deduct points
            await tx.user.update({
                where: { id: senderId },
                data: { points: { decrement: cosmetic.price } }
            });

            // Grant item
            await tx.userCosmetic.create({
                data: {
                    userId: recipient.id,
                    cosmeticId: cosmeticId,
                    giftedByUserId: senderId,
                    giftMessage: message || null,
                    isEquipped: false
                }
            });

            // Create notification for recipient
            const giftMsgPart = message ? ` Mesajı: "${message}"` : '';
            await tx.notification.create({
                data: {
                    userId: recipient.id,
                    title: '🎁 Bir Hediye Aldınız!',
                    message: `${sender.name || 'Bir kullanıcı'} size "${cosmetic.name}" hediye etti!${giftMsgPart}`,
                    type: 'success'
                }
            });
        });

        // Trigger gifting master achievement
        const { advanceAchievementProgress } = await import('@/lib/achievements');
        await advanceAchievementProgress(senderId, 'quest-gift-master', 1, 'increment');

        return NextResponse.json(
            { success: true, message: `${recipient.name || recipient.email} kullanıcısına başarıyla hediye edildi!` },
            { headers: PRIVATE_NO_STORE_HEADERS }
        );

    } catch (error) {
        console.error('[SHOP_GIFT_ERROR]', error);
        return NextResponse.json(
            { error: 'Hediye gönderme işlemi sırasında bir sunucu hatası oluştu.' },
            { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
        );
    }
}
