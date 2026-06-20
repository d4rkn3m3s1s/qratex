import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getInstallToValue, getInstallToValueStats } from '@/lib/install-to-value';


export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const results = await getInstallToValue();
  const stats = await getInstallToValueStats(results); // çift hesaplamayı önle

  return NextResponse.json({
    installToValue: results,
    averageMinutes: stats.averageMinutes,
    medianMinutes: stats.medianMinutes,
    p95Minutes: stats.p95Minutes,
    sampleSize: stats.sampleSize,
    cappedOutliers: stats.cappedOutliers,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
