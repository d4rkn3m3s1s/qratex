import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron-auth';
import { runEconomyReconcile } from '@/lib/economy/reconcile';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Gece ekonomi mutabakatı (veri modeli B3) — `lib/economy/reconcile.ts`.
 * Defter ↔ bakiye, bağış ilerlemesi ↔ bağış toplamı, kupon sayacı ↔ kullanım satırı.
 * Yalnız GÖRÜNÜRLÜK: sapma SecurityAlert olarak yazılır, hiçbir bakiye/sayaç değiştirilmez.
 *
 * Ayrı dış tetikleyici YOK: günlük orkestratör (`/api/cron/daily`, `jobs.ts`) çağırır.
 * Elle: Bearer CRON_SECRET. Sorgu hatası → 500 (orkestratör alarm üretir).
 */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  try {
    const r = await runEconomyReconcile();
    return NextResponse.json({
      ok: true,
      ledgerDrift: r.ledgerDrift.length,
      donationDrift: r.donationDrift.length,
      couponDrift: r.couponDrift.length,
      alerts: r.alerts,
    });
  } catch (e) {
    console.error('[CRON economy-reconcile] başarısız:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : 'hata' },
      { status: 500 }
    );
  }
}
