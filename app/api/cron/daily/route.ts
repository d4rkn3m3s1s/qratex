import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

// Alt görevlerin GET handler'larını doğrudan çağırırız (her biri kendi CRON_SECRET'ını doğrular).
import { GET as internDeadline } from '@/app/api/cron/intern-deadline/route';
import { GET as teamTaskDue } from '@/app/api/cron/team-task-due/route';
import { GET as inboxSync } from '@/app/api/cron/inbox-sync/route';
import { GET as squadBattles } from '@/app/api/cron/squad-battles/route';
import { GET as cleanupCounters } from '@/app/api/cron/cleanup-counters/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function validBearer(authHeader: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const got = authHeader ?? '';
  if (got.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(got), Buffer.from(expected)); } catch { return false; }
}

/**
 * GÜNLÜK CRON ORKESTRATÖRÜ — Vercel Hobby planı cron'ları günde 1 kez + sınırlı sayıda çalıştırır.
 * Bu yüzden tüm periyodik işler TEK cron'da toplandı: her biri sırayla, yetkili çağrılır.
 * Bir alt görevin patlaması diğerlerini durdurmaz (her biri ayrı try/catch). CRON_SECRET fail-closed.
 *
 * NOT: Hobby'de daha sık gerekiyorsa (ör. inbox saatlik) harici cron (cron-job.org) ile ilgili
 * alt-endpoint'i ayrıca tetikleyebilirsin; endpoint'ler bağımsız çalışır.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET ayarlı değil; cron devre dışı.' }, { status: 503 });
  if (!validBearer(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Alt görevlere yetkili sentetik istek (her biri kendi bearer kontrolünü geçsin).
  const authedReq = () => new Request('https://internal/cron', { headers: { authorization: `Bearer ${secret}` } });

  const tasks: { name: string; fn: (r: Request) => Promise<Response> }[] = [
    { name: 'intern-deadline', fn: internDeadline },
    { name: 'team-task-due', fn: teamTaskDue },
    { name: 'inbox-sync', fn: inboxSync },
    { name: 'squad-battles', fn: squadBattles },
    { name: 'cleanup-counters', fn: cleanupCounters },
  ];

  const results: Record<string, unknown> = {};
  for (const t of tasks) {
    try {
      const res = await t.fn(authedReq());
      let body: unknown;
      try { body = await res.json(); } catch { body = { status: res.status }; }
      results[t.name] = { status: res.status, ...(typeof body === 'object' && body ? body : { body }) };
    } catch (e) {
      results[t.name] = { error: e instanceof Error ? e.message : 'task failed' };
      console.error(`[CRON daily] ${t.name} başarısız:`, e);
    }
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}
