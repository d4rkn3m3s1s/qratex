import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getTenantHealth } from '@/lib/tenant-health';


export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const results = await getTenantHealth();
  return NextResponse.json({ tenantHealth: results }, { headers: PRIVATE_NO_STORE_HEADERS });
}
