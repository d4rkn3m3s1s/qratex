import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getWebVitalsSummary } from '@/lib/rum-web-vitals';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const body = getWebVitalsSummary();
  return NextResponse.json(body, { headers: PRIVATE_NO_STORE_HEADERS });
}
