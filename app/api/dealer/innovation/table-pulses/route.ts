import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { resolveDealerScope, scopeErrorResponse } from '@/lib/auth/scope';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { PRIVATE_NO_STORE_HEADERS, clampTakeParam } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const TABLE_PULSE_MAX = 100;

export async function GET(request: NextRequest) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.tablePulse) {
    return NextResponse.json(
      { error: 'Özellik devre dışı' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const limited = await enforceRouteRateLimit('dealer.innovation.table-pulses.list', session.user.id, 'read');
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  // Yönetici yalnız AÇIK dealerId ile, hedef gerçekten bayi ise ve denetim kaydıyla (O6);
  // eskiden dealerId'siz yönetici KENDİ kimliğiyle "bayi" sayılıyordu.
  const scope = await resolveDealerScope(session, {
    dealerId: session.user.role === 'ADMIN' ? searchParams.get('dealerId') : null,
    allowRoles: ['DEALER', 'ADMIN'],
    auditContext: 'dealer.innovation.table-pulses',
    auditMethod: 'GET',
  });
  if (!scope.ok) return scopeErrorResponse(scope);
  const targetDealerId = scope.dealerId;

  const take = clampTakeParam(searchParams.get('take'), 50, TABLE_PULSE_MAX);

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

  return NextResponse.json({ pulses }, { headers: PRIVATE_NO_STORE_HEADERS });
}
