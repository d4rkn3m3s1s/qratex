import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireDealerResource } from '@/lib/api-auth';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.tablePulse) {
    return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 });
  }

  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(request.url);
  const dealerIdParam = searchParams.get('dealerId');
  const targetDealerId =
    session.user.role === 'ADMIN' && dealerIdParam ? dealerIdParam : session.user.id;

  const forbidden = requireDealerResource(session, targetDealerId);
  if (forbidden) return forbidden;

  const take = Math.min(parseInt(searchParams.get('take') || '50', 10) || 50, 200);

  const pulses = await prisma.tablePulse.findMany({
    where: { dealerId: targetDealerId },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      mood: true,
      tableCode: true,
      note: true,
      createdAt: true,
      qrCodeId: true,
    },
  });

  return NextResponse.json({ pulses });
}
