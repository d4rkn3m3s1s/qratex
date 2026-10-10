import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getEffectiveMiniGames, getEffectiveMiniGame } from '@/lib/minigame-config-effective';
import { gameDayKey, isFinishedStatus, maxDurationSecOf, outcomeOfStatus } from '@/lib/game-session';
import { getMiniGame, PACMAN_GAME } from '@/lib/minigame-config';

export const dynamic = 'force-dynamic';

/**
 * GET — Oyuncunun BUGÜNKÜ deneme durumu + AKTİF oyunların etkin görsel yapılandırması.
 *
 * "Günde 1 deneme" (P0-17): kazanılan (`completed`), kaybedilen (`failed`) ve süresi dolmuş
 * yarım deneme hepsi "oynandı" sayılır → `playedToday` hepsini içerir (eskiden yalnız
 * kazanılanlar; kaybeden oyuncu kartı yine "Oyna" görüp sonunda 409 alıyordu).
 * `todayResults[gameType] = 'won' | 'lost'` kart başına sonucu verir.
 * Pasif (admin kapattı) ve portföyden gizlenen (§7.3) oyunlar `games` listesine girmez.
 */
export async function GET() {
  try {
    const auth = await requireAuth(['CUSTOMER']);
    if ('error' in auth) return auth.error;
    const now = new Date();

    const [rows, effective, pacman] = await Promise.all([
      prisma.miniGameSession.findMany({
        where: { userId: auth.session.user.id, dayKey: gameDayKey(now) },
        select: { gameType: true, status: true, startedAt: true, serverStartedAt: true, expiresAt: true },
      }),
      getEffectiveMiniGames(),
      getEffectiveMiniGame(PACMAN_GAME.gameType),
    ]);

    const todayResults: Record<string, 'won' | 'lost'> = {};
    for (const r of rows) {
      const outcome = outcomeOfStatus(r.status);
      if (outcome) {
        todayResults[r.gameType] = outcome;
        continue;
      }
      if (!isFinishedStatus(r.status)) {
        // Yarım deneme: süresi dolduysa (start/complete onu failed'a çekecek) kayıp göster.
        const def = getMiniGame(r.gameType) ?? (r.gameType === PACMAN_GAME.gameType ? PACMAN_GAME : undefined);
        const started = r.serverStartedAt ?? r.startedAt;
        const expiresAt = r.expiresAt ?? new Date(started.getTime() + maxDurationSecOf(def ?? {}) * 1000);
        if (now.getTime() > expiresAt.getTime()) todayResults[r.gameType] = 'lost';
      }
    }

    const games = effective
      .filter((g) => g.enabled && !g.hidden)
      .map((g) => ({
        gameType: g.gameType,
        title: g.title,
        description: g.description,
        emoji: g.emoji,
        accent: g.accent,
        rewardPoints: g.rewardPoints,
        rewardThreshold: g.rewardThreshold,
      }));

    return NextResponse.json(
      {
        success: true,
        playedToday: Object.keys(todayResults),
        todayResults,
        games,
        pacmanEnabled: pacman?.enabled ?? true,
      },
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
