import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getEffectiveMiniGame } from '@/lib/minigame-config-effective';
import { leaderboardHiddenUserIds, leaderboardIdentity } from '@/lib/privacy/leaderboard-optout';
import { LEADERBOARD_WINDOW, allTimeTop } from '@/lib/game-rankings';

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
 * o oyundaki EN İYİ kazanılmış (sunucu doğrulamalı) skoru alınır, sıralanır; ilk 10 +
 * isteyen kullanıcının kendi sırası döner. Skor = MiniGameSession.starsCollected.
 *
 * Yalnız müşteri (`requireAuth(['CUSTOMER'])`: rol + ban/oturum iptali DB'den). İlk
 * {@link LEADERBOARD_WINDOW} oyuncu taranır; daha fazlası varsa `totalCapped: true` ve
 * pencere dışındaki kullanıcının sırası `rank: null` (istemci "100+" yazar) — sayı uydurulmaz.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ game: string }> }
) {
  try {
    const auth = await requireAuth(['CUSTOMER']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('customer.games.leaderboard', auth.session.user.id, 'read');
    if (limited) return limited;
    const userId = auth.session.user.id;

    const { game: gameType } = await params;
    const game = await getEffectiveMiniGame(gameType);
    if (!game) {
      return NextResponse.json(
        { error: 'Oyun bulunamadı', leaderboard: [] },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const where = { gameType: game.gameType, status: 'completed', starsCollected: { gt: 0 } };
    // Her kullanıcının bu oyundaki en yüksek skoru (pencere + 1: fazlası var mı). Kısa TTL'li
    // önbellek; kazanılan sıralı deneme anahtarı düşürür (lib/game-rankings).
    const grouped = await allTimeTop(game.gameType);

    const totalCapped = grouped.length > LEADERBOARD_WINDOW;
    const ranked = grouped.slice(0, LEADERBOARD_WINDOW);

    const top = ranked.slice(0, 10);
    const [users, hiddenIds] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: top.map((r) => r.userId) } },
        select: { id: true, name: true, image: true },
      }),
      // "Liderlikte görün" kapalıysa başkalarına anonim (sıra/skor değişmez).
      leaderboardHiddenUserIds(top.map((r) => r.userId)),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));

    const leaderboard = top.map((r, i) => {
      const isMe = r.userId === userId;
      const identity = leaderboardIdentity(
        { name: shortName(userMap.get(r.userId)?.name ?? null), image: userMap.get(r.userId)?.image ?? null },
        { hidden: hiddenIds.has(r.userId), isViewer: isMe }
      );
      return { rank: i + 1, name: identity.name, image: identity.image, score: r.best, isMe };
    });

    // Kendi sıram (ilk 10 dışındaysam) + en iyi skorum.
    const myIndex = ranked.findIndex((r) => r.userId === userId);
    let me: { rank: number | null; score: number; inTop: boolean } | null =
      myIndex >= 0 ? { rank: myIndex + 1, score: ranked[myIndex].best, inTop: myIndex < 10 } : null;
    if (!me && totalCapped) {
      // Pencere dışındayım: sıram bilinmiyor ama en iyi skorum gerçek.
      const mine = await prisma.miniGameSession.aggregate({
        where: { ...where, userId },
        _max: { starsCollected: true },
      });
      const best = mine._max.starsCollected ?? 0;
      if (best > 0) me = { rank: null, score: best, inTop: false };
    }

    return NextResponse.json(
      { success: true, gameTitle: game.title, leaderboard, me, totalPlayers: ranked.length, totalCapped },
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
