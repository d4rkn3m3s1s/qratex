import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { syncActiveSeasonalConcept } from '@/lib/seasonal-concept-core';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Dönemsel konsept aktivasyon işi (saatlik cron). Penceresi açılan/kapanan
 * konseptleri yansıtmak için aktif konsepti hesaplayıp Settings'e yazar.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();
  const active = await syncActiveSeasonalConcept(new Date());
  return NextResponse.json({ ok: true, activeConceptId: active?.id ?? null });
}
