import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runCustomerReminderNudges } from '@/lib/customer-reminders';
import { runGamificationNudges } from '@/lib/gamification-nudges';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Günlük müşteri hatırlatmaları: yorum dürtmeleri (lib/customer-reminders) + oyunlaştırma
 * dürtmeleri (lib/gamification-nudges: seri tehlikede, açılmamış sürpriz kutu). İkisi bağımsız
 * ve paralel; biri düşerse koşu 500 döner (günlük iş alarmı), diğerinin sonucu yine yazılır.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const [reminders, gamification] = await Promise.all([
    runCustomerReminderNudges().then(
      (r) => ({ ok: true as const, ...r }),
      (e: unknown) => {
        console.error('[customer-reminder-nudges] yorum dürtmeleri başarısız', e);
        return { ok: false as const };
      }
    ),
    runGamificationNudges(),
  ]);
  const failed = !reminders.ok || gamification.errors.length > 0;
  return NextResponse.json({ reminders, gamification }, { status: failed ? 500 : 200 });
}
