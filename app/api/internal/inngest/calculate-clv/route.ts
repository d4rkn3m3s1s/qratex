import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { recomputeAllCLV } from '@/lib/clv-core';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * CLV hesaplama işi (günlük cron). Consumption + Feedback.churnRisk'ten tüm
 * müşterilerin CustomerLifetimeValue kayıtlarını günceller ve segment atar.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();
  const result = await recomputeAllCLV(new Date());
  return NextResponse.json({ ok: true, ...result });
}
