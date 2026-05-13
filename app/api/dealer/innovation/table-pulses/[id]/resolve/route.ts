import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth, requireDealerResource } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/** CONCERN sinyalini ekip kapattığında — sağlık skoru 2.0 için. */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const pulse = await prisma.tablePulse.findUnique({
      where: { id },
      select: { dealerId: true, mood: true },
    });
    if (!pulse) {
      return NextResponse.json({ error: 'Kayıt yok' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const forbidden = requireDealerResource(session, pulse.dealerId);
    if (forbidden) return forbidden;

    const resolvedAt = new Date();
    if (session.user.role === 'ADMIN') {
      const updated = await prisma.tablePulse.update({
        where: { id },
        data: { resolvedAt },
      });
      return NextResponse.json({ success: true, pulse: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const n = await prisma.tablePulse.updateMany({
      where: { id, dealerId: session.user.id },
      data: { resolvedAt },
    });
    if (n.count === 0) {
      return NextResponse.json({ error: 'Kayıt yok' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const updated = await prisma.tablePulse.findUnique({ where: { id } });
    return NextResponse.json({ success: true, pulse: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('table-pulse resolve:', error);
    return NextResponse.json({ error: 'Güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
