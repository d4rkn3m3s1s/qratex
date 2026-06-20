import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

function dayKeyFor(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(key: string, delta: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return dayKeyFor(d);
}

/**
 * GET — Oyuncunun MİNİ OYUN günlük serisi (streak). Herhangi bir oyunu
 * tamamladığı her gün "aktif gün" sayılır. Seri, bugünden (veya dünden) geriye
 * doğru kesintisiz aktif gün sayısıdır. Genel /api/streak'ten bağımsız; sadece
 * MiniGameSession verisinden türetilir (ayrı tablo yok).
 *
 * Dönüş: { current, longest, playedToday, nextRewardIn, milestone }
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Unauthorized', current: 0, longest: 0 },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Tamamlanmış oturumların benzersiz günleri (son ~120 gün yeterli).
    const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    const rows = await prisma.miniGameSession.findMany({
      where: { userId: session.user.id, status: 'completed', completedAt: { gte: since } },
      select: { dayKey: true },
      distinct: ['dayKey'],
      orderBy: { dayKey: 'desc' },
    });
    const days = new Set(rows.map((r) => r.dayKey));

    const today = dayKeyFor(new Date());
    const yesterday = addDays(today, -1);
    const playedToday = days.has(today);

    // Seriyi bugünden (oynadıysa) yoksa dünden geriye say.
    let cursor = playedToday ? today : days.has(yesterday) ? yesterday : null;
    let current = 0;
    while (cursor && days.has(cursor)) {
      current += 1;
      cursor = addDays(cursor, -1);
    }

    // En uzun seri (tüm pencere içinde).
    const sorted = [...days].sort();
    let longest = 0;
    let run = 0;
    let prev: string | null = null;
    for (const d of sorted) {
      if (prev && addDays(prev, 1) === d) run += 1;
      else run = 1;
      if (run > longest) longest = run;
      prev = d;
    }

    // Sonraki seri ödülü kaç günde (her 3 günde bir bonus).
    const STEP = 3;
    const nextMilestone = (Math.floor(current / STEP) + 1) * STEP;
    const nextRewardIn = playedToday ? nextMilestone - current : 0;

    return NextResponse.json(
      {
        success: true,
        current,
        longest: Math.max(longest, current),
        playedToday,
        milestoneStep: STEP,
        nextMilestone,
        nextRewardIn,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[MINIGAME_STREAK]', error);
    return NextResponse.json(
      { error: 'Seri alınamadı', current: 0, longest: 0 },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
