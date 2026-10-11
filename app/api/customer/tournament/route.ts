import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getEffectiveMiniGame } from '@/lib/minigame-config-effective';
import { isEconomyError } from '@/lib/economy';
import { creditTournamentPrize, weeklyRanking } from '@/lib/game-rankings';
import { leaderboardHiddenUserIds, leaderboardIdentity } from '@/lib/privacy/leaderboard-optout';
import {
  isoWeekStart,
  isoWeekKey,
  previousIsoWeekKey,
  msUntilWeekEnd,
  prizeForRank,
} from '@/lib/tournament-core';
import {
  TOURNAMENT_MIN_PARTICIPANTS,
  featuredGameForWeek,
  prizeFor,
  prizeTable,
} from '@/lib/game-tournament';

export const dynamic = 'force-dynamic';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

/** Gizlilik: "Mehmet Yılmaz" → "Mehmet Y." */
function shortName(name: string | null): string {
  if (!name) return 'Oyuncu';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * GET /api/customer/tournament?game=<gameType>
 * Haftalık turnuva: bu haftanın canlı sıralaması (her oyun için gösterilir) + geri sayım.
 * Ödül YALNIZ haftanın öne çıkan oyununda ve en az TOURNAMENT_MIN_PARTICIPANTS oyuncu
 * varsa verilir. Geçen haftanın öne çıkan oyununda ilk 3'teysen ve almadıysan
 * `pendingReward` (hangi oyun sayfasında olursan ol) döner. `game` verilmezse öne çıkan oyun.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(['CUSTOMER']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('customer.tournament.read', auth.session.user.id, 'read');
    if (limited) return limited;
    const userId = auth.session.user.id;
    const now = new Date();

    // Öne çıkan oyun haftaya DONDURULMUŞ rotasyon takviminden (lib/game-tournament TOURNAMENT_ROTATION).
    const featuredNow = featuredGameForWeek(isoWeekKey(now));
    const requested = new URL(request.url).searchParams.get('game') || featuredNow || '';
    const game = await getEffectiveMiniGame(requested);
    if (!game) return json({ error: 'Oyun bulunamadı' }, 404);

    const isFeatured = game.gameType === featuredNow;
    const featuredGame = featuredNow ? await getEffectiveMiniGame(featuredNow) : null;

    // Bu haftanın canlı sıralaması.
    const ranked = await weeklyRanking(game.gameType, isoWeekStart(now), now);
    const top = ranked.slice(0, 10);
    const [users, hiddenIds] = top.length
      ? await Promise.all([
          prisma.user.findMany({
            where: { id: { in: top.map((r) => r.userId) } },
            select: { id: true, name: true, image: true },
          }),
          // "Liderlikte görün" kapalıysa başkalarına anonim (sıra ve ödül hakkı değişmez).
          leaderboardHiddenUserIds(top.map((r) => r.userId)),
        ])
      : [[], new Set<string>()] as const;
    const userMap = new Map(users.map((u) => [u.id, u]));
    const leaderboard = top.map((r, i) => {
      const isMe = r.userId === userId;
      const identity = leaderboardIdentity(
        { name: shortName(userMap.get(r.userId)?.name ?? null), image: userMap.get(r.userId)?.image ?? null },
        { hidden: hiddenIds.has(r.userId), isViewer: isMe }
      );
      return {
        rank: i + 1,
        name: identity.name,
        image: identity.image,
        score: r.best,
        prize: isFeatured ? prizeForRank(i + 1) : 0,
        isMe,
      };
    });
    const myIndex = ranked.findIndex((r) => r.userId === userId);
    const me = myIndex >= 0 ? { rank: myIndex + 1, score: ranked[myIndex].best } : null;

    // Geçen haftanın ÖNE ÇIKAN oyunundan bekleyen ödül.
    const prevWeekKey = previousIsoWeekKey(now);
    const prevFeatured = featuredGameForWeek(prevWeekKey);
    let pendingReward: { rank: number; points: number; weekKey: string; gameType: string; gameTitle: string } | null = null;
    if (prevFeatured) {
      const prevFrom = new Date(isoWeekStart(now).getTime() - WEEK_MS);
      const prevRanked = await weeklyRanking(prevFeatured, prevFrom, now);
      const idx = prevRanked.findIndex((r) => r.userId === userId);
      const points = idx >= 0 ? prizeFor(idx + 1, prevRanked.length) : 0;
      if (points > 0) {
        const alreadyClaimed = await prisma.tournamentRewardClaim.findUnique({
          where: { userId_gameType_weekKey: { userId, gameType: prevFeatured, weekKey: prevWeekKey } },
          select: { id: true },
        });
        if (!alreadyClaimed) {
          const prevGame = await getEffectiveMiniGame(prevFeatured);
          pendingReward = {
            rank: idx + 1,
            points,
            weekKey: prevWeekKey,
            gameType: prevFeatured,
            gameTitle: prevGame?.title ?? prevFeatured,
          };
        }
      }
    }

    const prizesActive = isFeatured && ranked.length >= TOURNAMENT_MIN_PARTICIPANTS;
    return json({
      success: true,
      gameType: game.gameType,
      gameTitle: game.title,
      weekKey: isoWeekKey(now),
      endsInMs: msUntilWeekEnd(now),
      leaderboard,
      me,
      totalPlayers: ranked.length,
      isFeatured,
      featured: featuredGame
        ? { gameType: featuredGame.gameType, title: featuredGame.title, emoji: featuredGame.emoji }
        : null,
      minParticipants: TOURNAMENT_MIN_PARTICIPANTS,
      participantsNeeded: isFeatured ? Math.max(0, TOURNAMENT_MIN_PARTICIPANTS - ranked.length) : 0,
      prizesActive,
      prizes: prizeTable(isFeatured),
      pendingReward,
    });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[TOURNAMENT_GET]', error);
    return json({ error: 'Turnuva alınamadı' }, 500);
  }
}

/**
 * POST /api/customer/tournament
 * GEÇEN haftanın öne çıkan oyununun ödülünü talep eder. Sunucu sıralamayı yeniden ve
 * belirli biçimde hesaplar (istemciye güvenmez). Tek-claim garantileri:
 *  - (userId, gameType, weekKey) unique → aynı kişi iki kez alamaz;
 *  - (gameType, weekKey) danışma kilidi + "bu sıra başkasına verildi mi" kontrolü →
 *    sıralama sonradan kaysa bile aynı sıraya iki ödül çıkmaz;
 *  - kredi `mintPoints` (defter idempotency `tournament:<oyun>:<hafta>:<kullanıcı>`,
 *    aynı tx'te points_credited).
 */
export async function POST() {
  try {
    const auth = await requireAuth(['CUSTOMER']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('customer.tournament.claim', auth.session.user.id, { max: 10, windowMs: 60_000 });
    if (limited) return limited;
    const userId = auth.session.user.id;
    const now = new Date();

    const prevWeekKey = previousIsoWeekKey(now);
    const gameType = featuredGameForWeek(prevWeekKey);
    const game = gameType ? await getEffectiveMiniGame(gameType) : null;
    if (!gameType || !game) return json({ success: false, error: 'Geçen hafta ödüllü turnuva yoktu.' }, 400);

    const prevFrom = new Date(isoWeekStart(now).getTime() - WEEK_MS);
    const prevRanked = await weeklyRanking(gameType, prevFrom, now);
    const idx = prevRanked.findIndex((r) => r.userId === userId);
    const rank = idx + 1;
    const points = idx >= 0 ? prizeFor(rank, prevRanked.length) : 0;
    if (idx < 0 || points <= 0) {
      return json(
        {
          success: false,
          error:
            idx >= 0 && idx < 3 && prevRanked.length < TOURNAMENT_MIN_PARTICIPANTS
              ? `Geçen hafta turnuvaya en az ${TOURNAMENT_MIN_PARTICIPANTS} oyuncu katılmadığı için ödül dağıtılmadı.`
              : 'Geçen hafta ödül kazanmadın.',
        },
        400
      );
    }

    // Tek kredi yolu (günlük 'tournament-settle' işiyle aynı): kilit + sıra tekilliği + mintPoints.
    const result = await prisma.$transaction((tx) =>
      creditTournamentPrize(tx, { userId, gameType, gameTitle: game.title, weekKey: prevWeekKey, rank, points })
    );

    if (result.kind === 'already') return json({ success: false, error: 'Bu ödülü zaten aldın.' }, 409);
    if (result.kind === 'rank_taken') {
      return json({ success: false, error: 'Bu sıranın ödülü başka bir oyuncuya verildi.' }, 409);
    }

    return json({ success: true, rank, points: result.credited, weekKey: prevWeekKey, gameType });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    if (isEconomyError(error)) return json({ success: false, error: error.message, code: error.code }, error.httpStatus);
    console.error('[TOURNAMENT_POST]', error);
    return json({ error: 'Ödül talep edilemedi' }, 500);
  }
}
