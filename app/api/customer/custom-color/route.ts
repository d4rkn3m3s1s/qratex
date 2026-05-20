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

        const userId = session.user.id;
        const { customFrameColor } = await req.json();

        // customFrameColor can be null (to reset) or a string (hue-rotate degree or hex)
        await prisma.user.update({
            where: { id: userId },
            data: { customFrameColor: customFrameColor || null }
        });

        if (customFrameColor) {
            const { advanceAchievementProgress } = await import('@/lib/achievements');
            await advanceAchievementProgress(userId, 'quest-color-wizard', 1, 'increment');
        }

        return NextResponse.json(
            { success: true, message: 'Çerçeve rengi başarıyla güncellendi!' },
            { headers: PRIVATE_NO_STORE_HEADERS }
        );

    } catch (error) {
        console.error('[CUSTOM_COLOR_ERROR]', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
        );
    }
}
