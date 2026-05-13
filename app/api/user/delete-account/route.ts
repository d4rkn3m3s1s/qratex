import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const deleteSchema = z.object({
    confirmEmail: z.string().email(),
});

// DELETE — permanently delete account and anonymize data
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAuth(['CUSTOMER', 'DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;
        const userId = auth.session.user.id;

        const body = await request.json();
        const parsed = deleteSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'E-posta doğrulaması gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!user || user.email !== parsed.data.confirmEmail) {
            return NextResponse.json({ error: 'E-posta eşleşmiyor' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        // Anonymize feedbacks (keep for analytics but remove PII)
        await prisma.feedback.updateMany({
            where: { userId },
            data: { userId: null },
        });

        // Delete user and cascade all related data
        await prisma.user.delete({ where: { id: userId } });

        return NextResponse.json({ success: true, message: 'Hesabınız kalıcı olarak silindi' }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Account deletion error:', error);
        return NextResponse.json({ error: 'Hesap silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
