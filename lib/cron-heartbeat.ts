/**
 * Dead-man switch ve cron izleme (denetim Y1/Y5: "alarm/dead-man switch yok").
 *
 *  - `CRON_HEARTBEAT_URL` (healthchecks.io / Better Stack / Cronitor uyumlu): başarıda URL'ye,
 *    başarısızlıkta `<URL>/fail`'e kısa bir POST atılır. Ping HİÇ gelmezse (fonksiyon öldürüldü,
 *    Vercel cron tetiklemedi, DB uyanmadı) izleme servisi alarm üretir — "sessiz ölüm" kalmaz.
 *  - Sentry Cron Monitor: SENTRY_DSN tanımlıysa `in_progress` → `ok|error` check-in'i.
 * İkisi de best-effort'tur: izleme hatası işin sonucunu değiştirmez.
 */
import * as Sentry from '@sentry/nextjs';

const PING_TIMEOUT_MS = 5_000;

export type HeartbeatOutcome = 'sent' | 'skipped' | 'error';

function heartbeatUrl(base: string, ok: boolean): string | null {
  let u: URL;
  try {
    u = new URL(base.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!ok) u.pathname = `${u.pathname.replace(/\/$/, '')}/fail`;
  return u.toString();
}

export async function pingHeartbeat(
  ok: boolean,
  summary: unknown,
  base: string | undefined = process.env.CRON_HEARTBEAT_URL
): Promise<HeartbeatOutcome> {
  if (!base || !base.trim()) return 'skipped';
  const url = heartbeatUrl(base, ok);
  if (!url) return 'error';
  try {
    const body = JSON.stringify(summary ?? {}).slice(0, 10_000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    return res.ok ? 'sent' : 'error';
  } catch {
    return 'error';
  }
}

const MONITOR_SLUG = 'cron-daily';

/** Sentry check-in başlatır; DSN yoksa `null`. */
export function startCronCheckIn(schedule = '0 3 * * *', maxRuntimeMinutes = 6): string | null {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return null;
  try {
    return Sentry.captureCheckIn(
      { monitorSlug: MONITOR_SLUG, status: 'in_progress' },
      {
        schedule: { type: 'crontab', value: schedule },
        checkinMargin: 30,
        maxRuntime: maxRuntimeMinutes,
        timezone: 'UTC',
      }
    );
  } catch {
    return null;
  }
}

export function finishCronCheckIn(checkInId: string | null, ok: boolean, durationSec?: number): void {
  if (!checkInId) return;
  try {
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: MONITOR_SLUG,
      status: ok ? 'ok' : 'error',
      ...(typeof durationSec === 'number' ? { duration: durationSec } : {}),
    });
  } catch {
    /* izleme hatası işi bozmaz */
  }
}
