/**
 * GET — tek savaşın skor tablosu (iki klandan birinin üyesi ya da ADMIN).
 * Müşteri arayüzü güncel savaşı `battles/current`'tan alır; bu uç admin savaş listesindeki
 * detay bağlantısı ve geçmişten detay için korunur.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { squadError } from '@/lib/squads/errors';
import { contributorName } from '@/lib/squads/battles';
import { leaderboardHiddenUserIds, leaderboardIdentity } from '@/lib/privacy/leaderboard-optout';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'customer.squads.battle.detail',
    roles: ['CUSTOMER', 'ADMIN'],
    module: 'squads',
    rateLimit: 'read',
    params: z.object({ id: z.string().min(1).max(64) }),
  },
  async ({ user, params }) => {
    const battle = await prisma.squadBattle.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        acceptedAt: true,
        squad1Score: true,
        squad2Score: true,
        winnerId: true,
        rewardPool: true,
        rewardFunded: true,
        cancelReason: true,
        squad1: { select: { id: true, name: true } },
        squad2: { select: { id: true, name: true } },
      },
    });
    if (!battle) throw squadError('BATTLE_NOT_FOUND');

    const membership = await prisma.squadMember.findFirst({
      where: { userId: user.id, squadId: { in: [battle.squad1.id, battle.squad2.id] } },
      select: { squadId: true },
    });
    if (!membership && user.role !== 'ADMIN') throw squadError('NOT_SQUAD_MEMBER', 'Bu savaşı görme yetkin yok.');

    const top = await prisma.squadBattleParticipant.findMany({
      where: { battleId: battle.id, score: { gt: 0 } },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
      take: 10,
      select: { score: true, squadId: true, userId: true, user: { select: { name: true, image: true } } },
    });
    // Gizlilik (müşteri API denetimi O5 kalıntısı): rakip klan üyeleri yabancıdır → maskeli ad
    // ("Ayşe K.", `battles/current` ile aynı kural); "liderlikte görün" kapalı rakip üye anonim
    // ve avatarsız. Kendi klanındakiler klan odasında zaten tam adla görünür. ADMIN tam görür.
    const viewerSquadId = membership?.squadId ?? null;
    const isAdmin = user.role === 'ADMIN';
    const rivalIds = isAdmin ? [] : top.filter((p) => p.squadId !== viewerSquadId).map((p) => p.userId);
    const hiddenRivals = await leaderboardHiddenUserIds(rivalIds);

    return ok({
      battle: {
        ...battle,
        mySquadId: membership?.squadId ?? null,
        topParticipants: top.map((p) => {
          const sameSquad = isAdmin || p.squadId === viewerSquadId;
          const identity = leaderboardIdentity(
            { name: contributorName(p.user.name, sameSquad), image: p.user.image },
            { hidden: !sameSquad && hiddenRivals.has(p.userId), isViewer: p.userId === user.id }
          );
          return { name: identity.name, image: identity.image, score: p.score, squadId: p.squadId };
        }),
      },
    }, { legacySpread: true });
  }
);
