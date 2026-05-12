import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
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

        // Check if staff belongs to the dealer
        const staff = await prisma.dealerStaff.findUnique({
            where: { id: staffId },
        });

        if (!staff || staff.dealerId !== session.user.id) {
            return NextResponse.json({ success: false, error: 'Personel bulunamadı veya yetkisiz erişim' }, { status: 404 });
        }

        const updated = await prisma.dealerStaff.update({
            where: { id: staffId },
            data: {
                jobTitle,
                pinCode,
                isActive,
            },
        });

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

        return NextResponse.json({ success: true, staff: updated });
    } catch (error) {
        console.error('Update staff error:', error);
        return NextResponse.json({ success: false, error: 'Personel güncellenemedi' }, { status: 500 });
    }
}
