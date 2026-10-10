import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { revokeInvitation } from '@/lib/staff-invitations';

export const dynamic = 'force-dynamic';

/** DELETE /api/dealer/staff/invitations/[id] — bekleyen daveti iptal eder (yalnız kendi daveti). */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return auth.error;
    const dealerId = auth.session.user.id;
    const { id } = await props.params;

    const revoked = await revokeInvitation(dealerId, id);
    if (!revoked) {
      return NextResponse.json(
        { success: false, error: 'Bekleyen davet bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    await prisma.auditLog
      .create({
        data: {
          userId: dealerId,
          action: 'REVOKE_STAFF_INVITATION',
          entity: 'StaffInvitation',
          entityId: id,
          ...getAuditRequestMeta(request),
        },
      })
      .catch(() => {});
    return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Staff invitation DELETE:', error);
    return NextResponse.json(
      { success: false, error: 'Davet iptal edilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
