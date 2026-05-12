import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getTenantHealth } from '@/lib/tenant-health';


export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const results = await getTenantHealth();
  return NextResponse.json({ tenantHealth: results });
}
