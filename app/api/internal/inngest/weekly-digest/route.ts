import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runWeeklyDigestForAllDealers } from '@/lib/weekly-digest-core';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';
import { readCronDeadline } from '@/lib/cron-delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Haftalık AI digest işi (Pazartesi; günlük orkestratörün kayıt defterinden). Tüm bayiler için
 * geçen haftanın özetini üretir: DealerWeeklyBrief upsert + in-app bildirim + e-posta.
 *
 * Sonuç dürüsttür (arka plan Y6): e-postası gidemeyen, hata veren ya da süre bütçesi yüzünden
 * ertelenen bayi varsa `ok:false` + 500 → orkestratör işi başarısız sayar, alarm üretir ve ertesi
 * gün yeniden koşar. Bayi başına tek-seferlik anahtarlar sayesinde yeniden koşu yalnız kalanları
 * işler; kimseye ikinci bildirim/e-posta gitmez.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();
  const deadlineAt = readCronDeadline(req, 280_000);
  const result = await runWeeklyDigestForAllDealers(new Date(), { deadlineAt });
  const ok = result.emailFailed === 0 && result.failed === 0 && result.deferred === 0;
  const error = ok
    ? undefined
    : [
        result.emailFailed ? `${result.emailFailed} bayinin özet e-postası gönderilemedi` : '',
        result.failed ? `${result.failed} bayi için özet üretilemedi` : '',
        result.deferred ? `${result.deferred} bayi süre bütçesi yüzünden ertelendi` : '',
      ]
        .filter(Boolean)
        .join('; ');
  return NextResponse.json({ ok, ...result, ...(error ? { error } : {}) }, { status: ok ? 200 : 500 });
}
