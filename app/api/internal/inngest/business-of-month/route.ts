import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { awardBusinessOfMonth } from '@/lib/business-of-month';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * "Ayın İşletmesi" — her ayın başında bir önceki ayın 1. işletmesine ROZET/ünvan verir.
 * Puan DEĞİL rozet olduğu için puan ekonomisine dokunmaz (escrow/mint gerekmez).
 * İdempotent: aynı periodKey ikinci kez ödüllendirilmez.
 * Auth: fail-closed (authorizeInternalJobRequest) — secret yoksa/yanlışsa 401.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  try {
    const now = new Date();
    const { skipped, record } = await awardBusinessOfMonth(now);
    return NextResponse.json({
      success: true,
      skipped,
      periodKey: record.periodKey,
      winner: record.winner,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    );
  }
}
