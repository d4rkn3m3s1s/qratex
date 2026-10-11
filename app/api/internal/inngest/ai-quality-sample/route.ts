import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';
import { parsePositiveIntEnv } from '@/lib/safe-env-number';
import { SYSTEM_ACTOR } from '@/lib/data-safety/audit';
import { runSampling } from '@/lib/ai-quality/quality.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const AI_QUALITY_SAMPLE_SIZE = Math.min(200, Math.max(10, parsePositiveIntEnv(process.env.AI_QUALITY_SAMPLE_SIZE, 100)));

/**
 * Haftalık AI kalite örneklemesi (`/api/cron/daily` Pazar günü çağırır).
 * Katmanlı rastgele (duygu × niyet), LLM dışı analizler (sezgisel/yerel yedek) ve demo bayiler
 * hariç; silinen yoruma ait bekleyen örnekler geçersiz sayılır. Ortak mantık: lib/ai-quality.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();
  const result = await runSampling({ size: AI_QUALITY_SAMPLE_SIZE, days: 7 }, { ...SYSTEM_ACTOR, type: 'cron' });
  return NextResponse.json({ checked: result.candidates, samplesCreated: result.created, voided: result.voided, strata: result.strata });
}
