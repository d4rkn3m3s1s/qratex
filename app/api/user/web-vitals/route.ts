import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { recordWebVitalEntry, type WebVitalName, type WebVitalRating } from '@/lib/rum-web-vitals';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  name: z.enum(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']),
  value: z.number(),
  delta: z.number(),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  id: z.string().min(1).max(128),
  navigationType: z.string().max(64).optional(),
  path: z.string().max(512).optional(),
});

export async function POST(req: Request) {
  const auth = await requireAuth(['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN']);
  if ('error' in auth) return auth.error;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const role = String(auth.session.user?.role ?? 'UNKNOWN');
  const userId = String(auth.session.user?.id ?? 'unknown');
  const path = parsed.data.path?.trim() || '(unknown)';

  recordWebVitalEntry({
    userId,
    role,
    path,
    name: parsed.data.name as WebVitalName,
    value: parsed.data.value,
    delta: parsed.data.delta,
    rating: parsed.data.rating as WebVitalRating,
    id: parsed.data.id,
    navigationType: parsed.data.navigationType,
  });

  return NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
