import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron-auth';
import { readCronDeadline } from '@/lib/cron-delivery';
import { runInboxQueuesMaintenance } from '@/lib/dealer-queues/maintenance';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FALLBACK_BUDGET_MS = 40_000;

/**
 * Gelen Kutusu kuyruklarının günlük bakımı (`/api/cron/daily` içinden): demo olay temizliği,
 * yanıtlanan yorumun SLA vakasını kapatma, süresi dolan telafiler, onay hatırlatması ve kriz
 * radarı taraması. Herhangi bir adım düşerse 500 (orkestratörde kırmızı).
 */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const deadlineAt = readCronDeadline(req, FALLBACK_BUDGET_MS);
  const summary = await runInboxQueuesMaintenance(deadlineAt);
  const ok = summary.errors.length === 0;
  return NextResponse.json({ ok, ...summary }, { status: ok ? 200 : 500 });
}
