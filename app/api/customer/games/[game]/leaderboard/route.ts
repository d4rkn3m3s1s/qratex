import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getEffectiveMiniGame } from '@/lib/minigame-config-effective';

export const dynamic = 'force-dynamic';

/** Gizlilik: "Mehmet Yılmaz" → "Mehmet Y." */
function shortName(name: string | null): string {
  if (!name) return 'Oyuncu';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * GET — Bir oyunun en yüksek skorlu oyuncuları (tüm zamanlar). Her kullanıcının
 * o oyundaki EN İYİ tamamlanmış skoru alınır, sıralanır; ilk 10 + isteyen
 * kullanıcının kendi sırası döner. Skor = MiniGameSession.starsCollected.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ game: string }> }
) {
  try {
    const { game: gameType } = await params;
    const game = await getEffectiveMiniGame(gameType);
    if (!game) {
      return NextResponse.json(
        { error: 'Oyun bulunamadı', leaderboard: [] },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Oturum gerekli', leaderboard: [] },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const userId = session.user.id;

    // Her kullanıcının bu oyundaki en yüksek skoru.
    const grouped = await prisma.miniGameSession.groupBy({
      by: ['userId'],
      where: { gameType: game.gameType, status: 'completed' },
      _max: { starsCollected: true },
      orderBy: { _max: { starsCollected: 'desc' } },
      take: 100,
    });

    const ranked = grouped
      .map((g) => ({ userId: g.userId, best: g._max.starsCollected ?? 0 }))
      .filter((r) => r.best > 0);

    const top = ranked.slice(0, 10);
    const userIds = top.map((r) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, image: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const leaderboard = top.map((r, i) => ({
      rank: i + 1,
      name: shortName(userMap.get(r.userId)?.name ?? null),
      image: userMap.get(r.userId)?.image ?? null,
      score: r.best,
      isMe: r.userId === userId,
    }));

    // Kendi sıram (ilk 10 dışındaysam) + en iyi skorum.
    const myIndex = ranked.findIndex((r) => r.userId === userId);
    const me =
      myIndex >= 0
        ? { rank: myIndex + 1, score: ranked[myIndex].best, inTop: myIndex < 10 }
        : null;

    return NextResponse.json(
      { success: true, gameTitle: game.title, leaderboard, me, totalPlayers: ranked.length },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[MINIGAME_LEADERBOARD]', error);
    return NextResponse.json(
      { error: 'Liderlik tablosu alınamadı', leaderboard: [] },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
