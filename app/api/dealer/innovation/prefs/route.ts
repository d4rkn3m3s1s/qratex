import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireDealerResource } from '@/lib/api-auth';
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

  const { searchParams } = new URL(request.url);
  const dealerId =
    session.user.role === 'ADMIN' && searchParams.get('dealerId')
      ? searchParams.get('dealerId')!
      : session.user.id;

  const forbidden = requireDealerResource(session, dealerId);
  if (forbidden) return forbidden;

  const prefs = await getDealerInnovationPrefs(dealerId);
  return NextResponse.json({ prefs }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['DEALER', 'ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const dealerId =
    session.user.role === 'ADMIN' && typeof body.dealerId === 'string'
      ? body.dealerId
      : session.user.id;

  const forbidden = requireDealerResource(session, dealerId);
  if (forbidden) return forbidden;

  const prefs = await saveDealerInnovationPrefs(dealerId, parsed.data);
  return NextResponse.json({ success: true, prefs }, { headers: PRIVATE_NO_STORE_HEADERS });
}
