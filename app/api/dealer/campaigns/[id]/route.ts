import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

// PATCH — update campaign

export const dynamic = 'force-dynamic';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;
        const { id } = await params;

        const existing = await prisma.campaign.findUnique({ where: { id } });
        if (!existing || existing.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 });
        }
        if (existing.status === 'sent') {
            return NextResponse.json({ error: 'Gönderilmiş kampanya düzenlenemez' }, { status: 400 });
        }

        const body = await request.json();
        const campaign = await prisma.campaign.update({
            where: { id },
            data: {
                ...(typeof body.title === 'string' && { title: body.title }),
                ...(typeof body.message === 'string' && { message: body.message }),
                ...(typeof body.targetSegment === 'string' && { targetSegment: body.targetSegment }),
                ...(typeof body.channel === 'string' && { channel: body.channel }),
            },
        });

        return NextResponse.json({ success: true, campaign });
    } catch (error) {
        console.error('Error updating campaign:', error);
        return NextResponse.json({ error: 'Güncellenemedi' }, { status: 500 });
    }
}

// DELETE — delete campaign
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;
        const { id } = await params;

        const existing = await prisma.campaign.findUnique({ where: { id } });
        if (!existing || existing.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 });
        }

        await prisma.campaign.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting campaign:', error);
        return NextResponse.json({ error: 'Silinemedi' }, { status: 500 });
    }
}
