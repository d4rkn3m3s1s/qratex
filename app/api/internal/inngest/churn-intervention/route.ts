import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runChurnInterventionForAllDealers } from '@/lib/churn-intervention-core';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';
import { getModuleControls } from '@/lib/module-gate';

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
  // Yönetici "Churn riski" modülünü kapattıysa otomatik müdahale de durur (yalnız menü gizlenmez).
  const controls = await getModuleControls();
  if (controls.churn_risk === false) {
    return NextResponse.json({ ok: true, skipped: 'module_disabled', dealers: 0, flagged: 0, offers: 0 });
  }
  const result = await runChurnInterventionForAllDealers(new Date());
  return NextResponse.json({ ok: true, ...result });
}
