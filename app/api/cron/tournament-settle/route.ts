import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron-auth';
import { settlePreviousWeekTournament } from '@/lib/game-rankings';
import { getEffectiveMiniGame } from '@/lib/minigame-config-effective';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Haftalık oyun turnuvası kapanışı (oyun-ekosistemi K4) — geçen haftanın öne çıkan oyununda
 * ilk 3'e ödülü OTOMATİK kredi eder (`lib/game-rankings.settlePreviousWeekTournament`).
 * Eskiden ödül yalnız oyuncu o hafta "geçen hafta" ekranını açıp talep ederse veriliyordu;
 * uygulamaya girmeyen kazananın ödülü kayboluyordu. Talep ucu aynı kredi fonksiyonunu
 * kullanır → çift ödül yok (kilit + sıra tekilliği + defter idempotency).
 *
 * Ayrı dış tetikleyici YOK: günlük orkestratör (`/api/cron/daily`, `jobs.ts`) her gün çağırır;
 * tekrar koşu yalnız "zaten verildi" üretir, Pazartesi kaçarsa ertesi gün telafi eder.
 */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  try {
    const r = await settlePreviousWeekTournament(async (gameType) => {
      const g = await getEffectiveMiniGame(gameType);
      return g?.title ?? gameType;
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error('[CRON tournament-settle] başarısız:', e);
    return NextResponse.json({ ok: false, error: 'Turnuva kapanışı tamamlanamadı.' }, { status: 500 });
  }
}
