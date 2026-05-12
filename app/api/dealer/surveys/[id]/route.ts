import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

// PATCH — toggle active / update title

export const dynamic = 'force-dynamic';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;
        const { id } = await params;

        const existing = await prisma.survey.findUnique({ where: { id } });
        if (!existing || existing.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Anket bulunamadı' }, { status: 404 });
        }

        const body = await request.json();
        const survey = await prisma.survey.update({
            where: { id },
            data: {
                ...(typeof body.title === 'string' && { title: body.title }),
                ...(typeof body.description === 'string' && { description: body.description }),
                ...(typeof body.isActive === 'boolean' && { isActive: body.isActive }),
            },
        });

        return NextResponse.json({ success: true, survey });
    } catch (error) {
        console.error('Error updating survey:', error);
        return NextResponse.json({ error: 'Güncellenemedi' }, { status: 500 });
    }
}

// DELETE — remove survey and all responses
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;
        const { id } = await params;

        const existing = await prisma.survey.findUnique({ where: { id } });
        if (!existing || existing.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Anket bulunamadı' }, { status: 404 });
        }

        await prisma.survey.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting survey:', error);
        return NextResponse.json({ error: 'Silinemedi' }, { status: 500 });
    }
}
