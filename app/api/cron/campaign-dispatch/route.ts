/**
 * Planlı bayi kampanyalarını gönderir — günlük orkestratörün (`/api/cron/daily`) işi.
 * Ayrı dış tetikleyici YOK (tek uyanış kuralı). Gün hassasiyeti: kampanya, planlandığı İstanbul
 * gününün sabahki turunda (03:00 UTC = 06:00 İstanbul) çıkar.
 *
 * Alan hatası (kitle boş vb.) → kampanya `failed` + bayiye bildirim; altyapı hatası → planlı
 * kalır, ertesi tur yeniden dener ve yanıt 500 olur (alarm).
 */
import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron-auth';
import { readCronDeadline } from '@/lib/cron-delivery';
import { dispatchDueCampaigns } from '@/components/dealer/b-kampanyalar/server/schedule';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FALLBACK_BUDGET_MS = 45_000;

export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const deadlineAt = readCronDeadline(req, FALLBACK_BUDGET_MS);
  try {
    const summary = await dispatchDueCampaigns({ deadlineAt });
    const healthy = summary.errored === 0 && summary.skippedBudget === 0;
    return NextResponse.json({ ok: healthy, ...summary }, { status: healthy ? 200 : 500 });
  } catch (error) {
    console.error('[campaign-dispatch] koşu başarısız', error);
    return NextResponse.json({ ok: false, error: 'Planlı kampanyalar gönderilemedi.' }, { status: 500 });
  }
}
