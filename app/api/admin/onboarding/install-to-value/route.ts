import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getInstallToValue, getInstallToValueStats } from '@/lib/install-to-value';


export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const results = await getInstallToValue();
  const stats = await getInstallToValueStats();

  return NextResponse.json({
    installToValue: results,
    averageMinutes: stats.averageMinutes,
    medianMinutes: stats.medianMinutes,
    p95Minutes: stats.p95Minutes,
    sampleSize: stats.sampleSize,
    cappedOutliers: stats.cappedOutliers,
  });
}
