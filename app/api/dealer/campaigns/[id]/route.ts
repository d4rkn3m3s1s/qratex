import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

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
        if (!existing) {
            return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        if (auth.session.user.role !== 'ADMIN' && existing.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        if (existing.status === 'sent') {
            return NextResponse.json({ error: 'Gönderilmiş kampanya düzenlenemez' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const body = await request.json();
        const data = {
            ...(typeof body.title === 'string' && { title: body.title }),
            ...(typeof body.message === 'string' && { message: body.message }),
            ...(typeof body.targetSegment === 'string' && { targetSegment: body.targetSegment }),
            ...(typeof body.channel === 'string' && { channel: body.channel }),
        };

        if (Object.keys(data).length === 0) {
            const campaign = await prisma.campaign.findUnique({ where: { id } });
            return NextResponse.json({ success: true, campaign }, { headers: PRIVATE_NO_STORE_HEADERS });
        }

        const where =
            auth.session.user.role === 'ADMIN'
                ? { id }
                : { id, dealerId: auth.session.user.id, status: { not: 'sent' as const } };
        const n = await prisma.campaign.updateMany({ where, data });
        if (n.count === 0) {
            return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const campaign = await prisma.campaign.findUnique({ where: { id } });
        return NextResponse.json({ success: true, campaign }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error updating campaign:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
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
        if (!existing) {
            return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        if (auth.session.user.role !== 'ADMIN' && existing.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        if (auth.session.user.role === 'ADMIN') {
            const n = await prisma.campaign.deleteMany({ where: { id } });
            if (n.count === 0) {
                return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
            }
        } else {
            const n = await prisma.campaign.deleteMany({
                where: { id, dealerId: auth.session.user.id },
            });
            if (n.count === 0) {
                return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
            }
        }
        return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error deleting campaign:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
