/**
 * Cron teslimat yardımcıları (denetim Y2: "tekrar deneme gerçekte yok").
 *
 * Günde tek koşu olduğundan "sonraki cron tekrar dener" varsayımı geçersizdir. Geçici SMTP
 * hatalarında aynı koşu içinde kısa geri çekilmeyle yeniden denenir; kalıcı başarısızlık
 * çağırana bildirilir (iş `ok:false` döner → orkestratör non-2xx + alarm).
 */
import type { SendMailResult } from '@/lib/mail-sender';

/** Orkestratörün geçirdiği son tarih başlığı (`app/api/cron/daily/jobs.ts` ile aynı ad). */
export const CRON_DEADLINE_HEADER = 'x-cron-deadline-at';

/**
 * İsteğin son tarihini okur. Başlık yoksa (doğrudan çağrı) `fallbackMs` sonrası.
 * Geçmişte ya da saçma uzak bir değer gelirse yine makul sınıra çekilir.
 */
export function readCronDeadline(req: Request, fallbackMs: number, now: number = Date.now()): number {
  const raw = Number(req.headers.get(CRON_DEADLINE_HEADER));
  const fallback = now + fallbackMs;
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(raw, now + 10 * 60_000);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Gönderimi en fazla `attempts` kez dener (aralarda artan bekleme). Son tarihe yetmeyecekse
 * yeni deneme başlatmaz. Sonuç belirsizse (`maybeDelivered`: ileti gitmiş olabilir) yeniden
 * DENEMEZ. Son sonucu döndürür.
 */
export async function sendWithRetry(
  send: () => Promise<SendMailResult>,
  opts: { attempts?: number; backoffMs?: number; deadlineAt?: number } = {}
): Promise<SendMailResult & { attempts: number }> {
  const attempts = Math.max(1, opts.attempts ?? 2);
  const backoff = Math.max(0, opts.backoffMs ?? 1_500);
  let last: SendMailResult = { ok: false, error: 'gönderilmedi' };
  for (let i = 1; i <= attempts; i++) {
    try {
      last = await send();
    } catch (e) {
      last = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (last.ok) return { ...last, attempts: i };
    // Belirsiz SMTP hatası: ileti gitmiş olabilir → yeniden deneme çift kopya üretir; dur.
    if (last.maybeDelivered) return { ...last, attempts: i };
    if (i < attempts) {
      const wait = backoff * i;
      if (opts.deadlineAt && Date.now() + wait + 5_000 > opts.deadlineAt) return { ...last, attempts: i };
      await sleep(wait);
    }
  }
  return { ...last, attempts };
}
