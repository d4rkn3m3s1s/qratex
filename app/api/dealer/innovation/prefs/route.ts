import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { resolveDealerScope, scopeErrorResponse } from '@/lib/auth/scope';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getDealerInnovationPrefs, saveDealerInnovationPrefs } from '@/lib/innovation-dealer-prefs';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  staffTableInsights: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const limitedRead = await enforceRouteRateLimit('dealer.innovation.prefs.get', session.user.id, 'read');
  if (limitedRead) return limitedRead;

  const { searchParams } = new URL(request.url);
  // Yönetici yalnız AÇIK dealerId ile, hedef gerçekten bayi ise ve denetim kaydıyla (O6);
  // eskiden dealerId'siz yönetici KENDİ kimliğiyle "bayi" sayılıyordu.
  const scope = await resolveDealerScope(session, {
    dealerId: session.user.role === 'ADMIN' ? searchParams.get('dealerId') : null,
    allowRoles: ['DEALER', 'ADMIN'],
    auditContext: 'dealer.innovation.prefs',
    auditMethod: 'GET',
  });
  if (!scope.ok) return scopeErrorResponse(scope);
  const dealerId = scope.dealerId;

  const prefs = await getDealerInnovationPrefs(dealerId);
  return NextResponse.json({ prefs }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const limited = await enforceRouteRateLimit('dealer.innovation.prefs', session.user.id, 'mutation');
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  // Yönetici yalnız AÇIK dealerId ile, hedef gerçekten bayi ise ve denetim kaydıyla (O6);
  // eskiden dealerId'siz yönetici KENDİ kimliğiyle "bayi" sayılıyordu.
  const scope = await resolveDealerScope(session, {
    dealerId: session.user.role === 'ADMIN' ? (typeof body?.dealerId === 'string' ? body.dealerId : null) : null,
    allowRoles: ['DEALER', 'ADMIN'],
    auditContext: 'dealer.innovation.prefs.update',
    auditMethod: 'PUT',
  });
  if (!scope.ok) return scopeErrorResponse(scope);
  const dealerId = scope.dealerId;

  const prefs = await saveDealerInnovationPrefs(dealerId, parsed.data);
  return NextResponse.json({ success: true, prefs }, { headers: PRIVATE_NO_STORE_HEADERS });
}
