import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { MINIGAME } from '@/lib/minigame-config';

export const dynamic = 'force-dynamic';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * POST — Günün oyununu başlatır. Günde 1 hak: @@unique([userId, gameType, dayKey]).
 * Bugünün oturumu zaten tamamlandıysa yeni başlatılamaz (canPlay=false).
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Unauthorized', canPlay: false },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const userId = session.user.id;
    const dayKey = todayKey();

    const existing = await prisma.miniGameSession.findUnique({
      where: { userId_gameType_dayKey: { userId, gameType: MINIGAME.gameType, dayKey } },
      select: { id: true, status: true, starsCollected: true, rewardPoints: true },
    });

    if (existing) {
      if (existing.status === 'completed') {
        return NextResponse.json(
          {
            success: true,
            canPlay: false,
            alreadyPlayed: true,
            session: existing,
            message: 'Bugünün oyununu zaten oynadınız. Yarın tekrar gelin!',
          },
          { headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      // Yarım kalan aktif oturum: aynısını döndür (tekrar başlatılabilir).
      return NextResponse.json(
        { success: true, canPlay: true, sessionId: existing.id, config: publicConfig() },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const created = await prisma.miniGameSession.create({
      data: { userId, gameType: MINIGAME.gameType, dayKey, status: 'active' },
      select: { id: true },
    });

    return NextResponse.json(
      { success: true, canPlay: true, sessionId: created.id, config: publicConfig() },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[MINIGAME_START]', error);
    return NextResponse.json(
      { error: 'Oyun başlatılamadı', canPlay: false },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

function publicConfig() {
  return {
    starsForReward: MINIGAME.starsForReward,
    totalStars: MINIGAME.totalStars,
    rewardPoints: MINIGAME.rewardPoints,
  };
}
