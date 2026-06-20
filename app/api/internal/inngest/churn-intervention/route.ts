import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runChurnInterventionForAllDealers } from '@/lib/churn-intervention-core';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Tahminsel churn müdahalesi (günlük cron, CLV hesaplamasından sonra).
 * Müdahalesi açık bayilerin riskli müşterilerini tespit eder; bayiyi uyarır,
 * config'e göre flash teklif taslağı oluşturur.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();
  const result = await runChurnInterventionForAllDealers(new Date());
  return NextResponse.json({ ok: true, ...result });
}
