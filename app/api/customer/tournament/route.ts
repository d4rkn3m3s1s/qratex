import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { getEffectiveMiniGame } from '@/lib/minigame-config-effective';
import { creditPointsAndXp } from '@/lib/points-wallet';
import {
  isoWeekStart,
  isoWeekEnd,
  isoWeekKey,
  previousIsoWeekKey,
  msUntilWeekEnd,
  prizeForRank,
} from '@/lib/tournament-core';

export const dynamic = 'force-dynamic';

/** Gizlilik: "Mehmet Yılmaz" → "Mehmet Y." */
function shortName(name: string | null): string {
  if (!name) return 'Oyuncu';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** Bir haftalık pencere için oyun sıralaması (kullanıcı başına EN İYİ skor). */
async function weeklyRanking(gameType: string, from: Date, to: Date) {
  const grouped = await prisma.miniGameSession.groupBy({
    by: ['userId'],
    where: { gameType, status: 'completed', completedAt: { gte: from, lt: to } },
    _max: { starsCollected: true },
    orderBy: { _max: { starsCollected: 'desc' } },
    take: 100,
  });
  return grouped
    .map((g) => ({ userId: g.userId, best: g._max.starsCollected ?? 0 }))
    .filter((r) => r.best > 0);
}

/**
 * GET /api/customer/tournament?game=<gameType>
 * HAFTALIK TURNUVA: bu haftanın canlı sıralaması (skor = MiniGameSession.starsCollected,
 * yalnız bu ISO hafta) + geri sayım + ilk 3 ödülü. Ayrıca geçen (kapanmış) haftadan
 * kullanıcının hak ettiği ama HENÜZ ALMADIĞI ödül varsa bildirir (POST ile talep edilir).
 */
export async function GET(request: NextRequest) {
  try {
    const gameType = new URL(request.url).searchParams.get('game') ?? '';
    const game = await getEffectiveMiniGame(gameType);
    if (!game) {
      return NextResponse.json({ error: 'Oyun bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const userId = session.user.id;
    const now = new Date();

    // Bu haftanın canlı sıralaması.
    const ranked = await weeklyRanking(game.gameType, isoWeekStart(now), isoWeekEnd(now));
    const top = ranked.slice(0, 10);
    const users = await prisma.user.findMany({
      where: { id: { in: top.map((r) => r.userId) } },
      select: { id: true, name: true, image: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const leaderboard = top.map((r, i) => ({
      rank: i + 1,
      name: shortName(userMap.get(r.userId)?.name ?? null),
      image: userMap.get(r.userId)?.image ?? null,
      score: r.best,
      prize: prizeForRank(i + 1),
      isMe: r.userId === userId,
    }));
    const myIndex = ranked.findIndex((r) => r.userId === userId);
    const me = myIndex >= 0 ? { rank: myIndex + 1, score: ranked[myIndex].best } : null;

    // Geçen (kapanmış) haftadan bekleyen ödül: kullanıcı ilk 3'teyse ve henüz almadıysa.
    const prevWeekKey = previousIsoWeekKey(now);
    const prevFrom = new Date(isoWeekStart(now).getTime() - 7 * 24 * 60 * 60 * 1000);
    const prevRanked = await weeklyRanking(game.gameType, prevFrom, isoWeekStart(now));
    const myPrevIndex = prevRanked.findIndex((r) => r.userId === userId);
    let pendingReward: { rank: number; points: number; weekKey: string } | null = null;
    if (myPrevIndex >= 0 && myPrevIndex < 3) {
      const points = prizeForRank(myPrevIndex + 1);
      if (points > 0) {
        const alreadyClaimed = await prisma.tournamentRewardClaim.findUnique({
          where: { userId_gameType_weekKey: { userId, gameType: game.gameType, weekKey: prevWeekKey } },
          select: { id: true },
        });
        if (!alreadyClaimed) {
          pendingReward = { rank: myPrevIndex + 1, points, weekKey: prevWeekKey };
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        gameType: game.gameType,
        gameTitle: game.title,
        weekKey: isoWeekKey(now),
        endsInMs: msUntilWeekEnd(now),
        leaderboard,
        me,
        totalPlayers: ranked.length,
        prizes: { 1: prizeForRank(1), 2: prizeForRank(2), 3: prizeForRank(3) },
        pendingReward,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[TOURNAMENT_GET]', error);
    return NextResponse.json({ error: 'Turnuva alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/**
 * POST /api/customer/tournament?game=<gameType>
 * GEÇEN (kapanmış) haftanın turnuva ödülünü talep eder. Sunucu, kullanıcının o haftaki
 * gerçek sırasını yeniden hesaplar (istemciye güvenmez); ilk 3'teyse ödülü ATOMİK tek-claim
 * ile verir (TournamentRewardClaim unique → çift ödül imkânsız) + points_credited (invariant #3).
 */
export async function POST(request: NextRequest) {
  try {
    const gameType = new URL(request.url).searchParams.get('game') ?? '';
    const game = await getEffectiveMiniGame(gameType);
    if (!game) {
      return NextResponse.json({ error: 'Oyun bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const userId = session.user.id;
    const now = new Date();

    // Geçen haftanın penceresi + kullanıcının GERÇEK sırası (sunucu-taraflı doğrulama).
    const prevWeekKey = previousIsoWeekKey(now);
    const prevFrom = new Date(isoWeekStart(now).getTime() - 7 * 24 * 60 * 60 * 1000);
    const prevRanked = await weeklyRanking(game.gameType, prevFrom, isoWeekStart(now));
    const idx = prevRanked.findIndex((r) => r.userId === userId);
    const points = idx >= 0 ? prizeForRank(idx + 1) : 0;
    if (idx < 0 || idx >= 3 || points <= 0) {
      return NextResponse.json(
        { success: false, error: 'Geçen hafta ödül kazanmadın.' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Atomik tek-claim: unique(userId, gameType, weekKey) create → kredile → event. Aynı tx.
    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.tournamentRewardClaim.createMany({
        data: [{ userId, gameType: game.gameType, weekKey: prevWeekKey, rank: idx + 1, points }],
        skipDuplicates: true,
      });
      if (claim.count === 0) return { credited: false as const }; // zaten alınmış

      await creditPointsAndXp(tx, { userId, points });
      await tx.analyticsEvent.create({
        data: {
          userId,
          event: 'points_credited',
          category: 'tournament',
          data: { points, gameType: game.gameType, weekKey: prevWeekKey, rank: idx + 1 },
        },
      });
      await tx.notification.create({
        data: {
          userId,
          type: 'success',
          title: `🏆 Turnuva ödülü!`,
          message: `${game.title} haftalık turnuvasında ${idx + 1}. oldun ve +${points} puan kazandın!`,
        },
      });
      return { credited: true as const };
    });

    if (!result.credited) {
      return NextResponse.json(
        { success: false, error: 'Bu ödülü zaten aldın.' },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true, rank: idx + 1, points, weekKey: prevWeekKey },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[TOURNAMENT_POST]', error);
    return NextResponse.json({ error: 'Ödül talep edilemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
