import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getEffectiveMiniGames } from '@/lib/minigame-config-effective';

export const dynamic = 'force-dynamic';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * GET — Oyuncunun BUGÜN tamamladığı oyunların gameType listesini + AKTİF oyunların
 * etkin görsel yapılandırmasını (admin override sonrası) döndürür. Oyun Merkezi
 * (hub) bununla hem "bugün oynandı" rozetini hem hangi oyunların açık olduğunu ve
 * güncel başlık/açıklama/emoji/renkleri gösterir. Pasif (admin kapattı) oyunlar
 * listede gelmez → hub'da gizlenir.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Unauthorized', playedToday: [], games: [] },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const [rows, effective] = await Promise.all([
      prisma.miniGameSession.findMany({
        where: { userId: session.user.id, dayKey: todayKey(), status: 'completed' },
        select: { gameType: true },
      }),
      getEffectiveMiniGames(),
    ]);

    // Yalnızca AKTİF oyunların hub kartı verisi (görsel override'lar dahil).
    const games = effective
      .filter((g) => g.enabled)
      .map((g) => ({
        gameType: g.gameType,
        title: g.title,
        description: g.description,
        emoji: g.emoji,
        accent: g.accent,
      }));

    return NextResponse.json(
      { success: true, playedToday: rows.map((r) => r.gameType), games },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[MINIGAME_STATUS]', error);
    return NextResponse.json(
      { error: 'Durum alınamadı', playedToday: [] },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
