import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireDealerResource } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/** CONCERN sinyalini ekip kapattığında — sağlık skoru 2.0 için. */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  const pulse = await prisma.tablePulse.findUnique({
    where: { id },
    select: { dealerId: true, mood: true },
  });
  if (!pulse) {
    return NextResponse.json({ error: 'Kayıt yok' }, { status: 404 });
  }

  const forbidden = requireDealerResource(session, pulse.dealerId);
  if (forbidden) return forbidden;

  const updated = await prisma.tablePulse.update({
    where: { id },
    data: { resolvedAt: new Date() },
  });

  return NextResponse.json({ success: true, pulse: updated });
}
