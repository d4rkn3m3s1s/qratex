import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';


export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    try {
        const auditMeta = getAuditRequestMeta(request);
        const auth = await requireAuth(['DEALER']);
        if ('error' in auth) return auth.error;
        const { session } = auth;

        const params = await props.params;
        const staffId = params.id;
        const body = await request.json();
        const { jobTitle, pinCode, isActive } = body;

        const data: { jobTitle?: string; pinCode?: string | null; isActive?: boolean } = {};
        if (jobTitle !== undefined) data.jobTitle = jobTitle;
        if (pinCode !== undefined) data.pinCode = pinCode;
        if (isActive !== undefined) data.isActive = isActive;

        if (Object.keys(data).length === 0) {
            const updated = await prisma.dealerStaff.findFirst({
                where: { id: staffId, dealerId: session.user.id },
            });
            if (!updated) {
                return NextResponse.json({ success: false, error: 'Personel bulunamadı veya yetkisiz erişim' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
            }
            return NextResponse.json({ success: true, staff: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
        }

        const write = await prisma.dealerStaff.updateMany({
            where: { id: staffId, dealerId: session.user.id },
            data,
        });

        if (write.count === 0) {
            return NextResponse.json({ success: false, error: 'Personel bulunamadı veya yetkisiz erişim' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const updated = await prisma.dealerStaff.findUnique({
            where: { id: staffId },
        });
        if (!updated) {
            return NextResponse.json({ success: false, error: 'Personel bulunamadı veya yetkisiz erişim' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        await prisma.auditLog.create({
            data: {
                userId: session.user.id,
                action: 'UPDATE_STAFF',
                entity: 'DealerStaff',
                entityId: staffId,
                newData: { jobTitle, pinCode, isActive },
                ...auditMeta,
            },
        });

        return NextResponse.json({ success: true, staff: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Update staff error:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ success: false, error: 'Personel güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
