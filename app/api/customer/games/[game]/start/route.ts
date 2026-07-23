import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getEffectiveMiniGame, type EffectiveMiniGame } from '@/lib/minigame-config-effective';

export const dynamic = 'force-dynamic';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * POST — Generic mini oyun başlatıcı. URL'deki [game] segmenti registry'den
 * çözülür (pacman hariç tüm oyunlar buradan geçer). Günde 1 hak:
 * @@unique([userId, gameType, dayKey]). Bugünün oturumu tamamlandıysa
 * yeni başlatılamaz (canPlay=false).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ game: string }> }
) {
  try {
    const { game: gameType } = await params;
    const game = await getEffectiveMiniGame(gameType);
    if (!game) {
      return NextResponse.json(
        { error: 'Oyun bulunamadı', canPlay: false },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    // Admin oyunu pasifleştirdiyse başlatma reddedilir (hub'da da gizlenir).
    if (!game.enabled) {
      return NextResponse.json(
        { error: 'Bu oyun şu anda kullanılamıyor', canPlay: false },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

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
      where: { userId_gameType_dayKey: { userId, gameType: game.gameType, dayKey } },
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
        { success: true, canPlay: true, sessionId: existing.id, config: publicConfig(game) },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const created = await prisma.miniGameSession.create({
      data: { userId, gameType: game.gameType, dayKey, status: 'active' },
      select: { id: true },
    });

    return NextResponse.json(
      { success: true, canPlay: true, sessionId: created.id, config: publicConfig(game) },
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

function publicConfig(game: EffectiveMiniGame) {
  return {
    maxScore: game.maxScore,
    rewardThreshold: game.rewardThreshold,
    rewardPoints: game.rewardPoints,
  };
}
