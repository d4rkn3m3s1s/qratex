import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const [insightsDemoCategories, suspiciousDemoLogs, aiQualityDemoSamples] = await Promise.all([
    prisma.user.count({
      where: {
        role: 'DEALER',
        businessCategory: { startsWith: 'demo-' },
      },
    }),
    prisma.suspiciousActivity.count({
      where: {
        metadata: { path: ['source'], equals: 'bootstrap' },
      },
    }),
    prisma.aIQualitySample.count({
      where: {
        notes: '[bootstrap-demo]',
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    summary: {
      insightsDemoCategories,
      suspiciousDemoLogs,
      aiQualityDemoSamples,
      totalDemoRecords: insightsDemoCategories + suspiciousDemoLogs + aiQualityDemoSamples,
    },
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
