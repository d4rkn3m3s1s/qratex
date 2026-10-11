import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron-auth';
import { syncInbox, isInboxConfigured } from '@/lib/mail-inbox';
import { applyInboxRetention } from '@/lib/mail-center/inbox.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron — gelen kutusunu UID artımlı senkronize eder (stajyer yanıtlarını otomatik ayırır) ve
 * admin bir saklama süresi seçtiyse süresi dolan mailleri temizler. CRON_SECRET fail-closed.
 * Senkron durumu `Settings[inbox_sync_state]`'e `syncInbox` içinde yazılır; panel
 * (`/admin/inbox`) "Son senkron" satırında bunu okur. Daha sık senkron için harici zamanlayıcı
 * (cron-job.org) bu ucu doğrudan çağırabilir: imleç sayesinde koşular birbirinin devamıdır.
 */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  let retention: { deleted: number; days: number | null } | { error: string };
  try {
    retention = await applyInboxRetention();
  } catch (e) {
    retention = { error: e instanceof Error ? e.message : 'saklama temizliği başarısız' };
  }

  if (!isInboxConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'imap-not-configured', retention });
  }

  const r = await syncInbox({ source: 'cron', maxMessages: 80, budgetMs: 45_000 });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, retention }, { status: 502 });
  // Saklama temizliği başarısızsa koşu "başarılı" sayılmaz (orkestratör alarm üretsin).
  if ('error' in retention) return NextResponse.json({ ...r, ok: false, retention }, { status: 500 });
  return NextResponse.json({ ...r, retention });
}
