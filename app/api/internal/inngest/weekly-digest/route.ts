import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runWeeklyDigestForAllDealers } from '@/lib/weekly-digest-core';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Haftalık AI digest işi (Pazartesi cron). Tüm bayiler için geçen haftanın
 * özetini üretir: DealerWeeklyBrief upsert + in-app bildirim + e-posta.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();
  const result = await runWeeklyDigestForAllDealers(new Date());
  return NextResponse.json({ ok: true, ...result });
}
