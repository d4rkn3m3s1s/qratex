/**
 * Klan savaşları (müşteri tarafı) — escrow net-sıfır çekirdeği `lib/squad-battle-service.ts`.
 *
 * Kapanan bulgular (customer_squads.md):
 *  - Bulgu 3: hem meydan okuyan hem hedef klanın donmuşluğu (`Squad.isFrozen`) kontrol edilir;
 *    kabulde de iki taraf kontrol edilir.
 *  - Bulgu 6: kadro KABUL anında, transaction içinde okunur (önceden transaction dışında okunuyordu).
 *  - Bulgu 7: süresi dolmuş savaş "CANLI" görünmez ve yeni meydan okumayı bloke etmez —
 *    okumada `resolveExpiredBattles` claim'li, idempotent sonlandırmayı çalıştırır
 *    (aktif → `settleSquadBattle`, yanıtlanmamış bekleyen → iadeli iptal). Günlük cron'u beklemez.
 *  - Envanter 20: meydan okuyan bekleyen davetini geri çekebilir (atomik iade).
 *  - Envanter 22–24: geri sayım, katkıcılar, sonuç ve geçmiş DTO'ları.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { debitPoints, InsufficientPointsError } from '@/lib/points-wallet';
import { cancelSquadBattle, settleSquadBattle, OPEN_BATTLE_STATUSES } from '@/lib/squad-battle-service';
import { BATTLE_RESULT_VISIBLE_MS, squadLevel } from './rules';
import { squadError } from './errors';
import { membershipOf } from './membership';
import type {
  BattleHistoryPage,
  BattleResultDto,
  BattleState,
  CurrentBattleDto,
  SquadSearchResult,
} from './dto';

const SQUADS_HREF = '/customer/squads';

/**
 * Süresi dolmuş açık savaşları kapatır (okumada çağrılır; idempotent, claim'li).
 * Hata yutulur ve loglanır: okuma yolu düşmez, cron yine yedek olarak çalışır.
 */
export async function resolveExpiredBattles(squadIds: readonly string[], now: Date = new Date()): Promise<number> {
  if (squadIds.length === 0) return 0;
  const ids = [...squadIds];
  const expired = await prisma.squadBattle.findMany({
    where: {
      status: { in: [...OPEN_BATTLE_STATUSES] },
      endTime: { lte: now },
      OR: [{ squad1Id: { in: ids } }, { squad2Id: { in: ids } }],
    },
    select: { id: true, status: true },
    take: 5,
  });
  let closed = 0;
  for (const b of expired) {
    try {
      if (b.status === 'active') {
        if (await settleSquadBattle(b.id)) closed += 1;
      } else {
        const r = await cancelSquadBattle(prisma, b.id, {
          actorId: null,
          actorRole: 'system',
          reason: 'Süre doldu: meydan okuma yanıtlanmadı',
          fromStatuses: ['pending'],
        });
        if (r.status === 'cancelled') closed += 1;
      }
    } catch (err) {
      console.error('[squads] süresi dolan savaş kapatılamadı', b.id, err);
    }
  }
  return closed;
}

// ───────────────────────────── Meydan okuma ─────────────────────────────

export async function createChallenge(
  userId: string,
  input: { targetSquadId: string; durationHours: number; rewardPool: number }
): Promise<{ battleId: string }> {
  const mySquad = await prisma.squad.findFirst({
    where: { ownerId: userId },
    select: { id: true, name: true, isFrozen: true },
  });
  if (!mySquad) throw squadError('NOT_SQUAD_OWNER', 'Meydan okumak için bir klanın lideri olmalısın.');
  if (input.targetSquadId === mySquad.id) throw squadError('BATTLE_SELF');

  const target = await prisma.squad.findUnique({
    where: { id: input.targetSquadId },
    select: { id: true, name: true, ownerId: true, isFrozen: true },
  });
  if (!target) throw new ApiError('NOT_FOUND', 'Rakip klan bulunamadı.');
  // Aynı kişinin iki klanı birbirine meydan okuyamaz (havuzu kendine basma istismarı).
  if (target.ownerId === userId) throw squadError('BATTLE_SELF');
  if (mySquad.isFrozen) throw squadError('SQUAD_FROZEN');
  if (target.isFrozen) throw squadError('SQUAD_FROZEN', 'Rakip klan şu anda askıya alınmış.');

  // Süresi dolmuş eski savaşlar çakışma sayılmasın.
  await resolveExpiredBattles([mySquad.id, target.id]);

  const now = new Date();
  let battleId: string;
  try {
    battleId = await prisma.$transaction(async (tx) => {
      // Kilit sırası kimliğe göre: iki lider aynı anda birbirine meydan okursa kilitlenme olmaz.
      for (const id of [mySquad.id, target.id].sort()) {
        await tx.$queryRaw`SELECT "id" FROM "Squad" WHERE "id" = ${id} FOR UPDATE`;
      }
      const existing = await tx.squadBattle.findFirst({
        where: {
          status: { in: [...OPEN_BATTLE_STATUSES] },
          endTime: { gt: now },
          OR: [
            { squad1Id: mySquad.id },
            { squad2Id: mySquad.id },
            { squad1Id: target.id },
            { squad2Id: target.id },
          ],
        },
        select: { id: true },
      });
      if (existing) throw squadError('BATTLE_CONFLICT');

      const created = await tx.squadBattle.create({
        data: {
          squad1Id: mySquad.id,
          squad2Id: target.id,
          status: 'pending',
          startTime: now, // kabulde güncellenir
          endTime: new Date(now.getTime() + input.durationHours * 3600_000),
          rewardPool: input.rewardPool,
          rewardFunded: input.rewardPool > 0,
          challengedById: userId,
        },
        select: { id: true },
      });
      if (input.rewardPool > 0) {
        await debitPoints(tx, {
          userId,
          points: input.rewardPool,
          source: 'squad_escrow',
          sourceId: created.id,
          idempotencyKey: `squad-escrow:${created.id}`,
          reason: 'Klan savaşı ödül havuzu (escrow)',
        });
      }
      await tx.notification.create({
        data: {
          userId: target.ownerId,
          title: 'Klan savaşı daveti',
          message:
            `${mySquad.name} klanı, ${target.name} klanınıza meydan okudu` +
            (input.rewardPool > 0 ? ` (ödül havuzu ${input.rewardPool.toLocaleString('tr-TR')} puan).` : ' (onur savaşı).') +
            ' Klan sayfandan kabul ya da ret edebilirsin.',
          type: 'info',
          data: { battleId: created.id, kind: 'squad_battle_challenge', href: SQUADS_HREF },
        },
      });
      return created.id;
    });
  } catch (err) {
    if (err instanceof InsufficientPointsError) {
      throw new ApiError(
        'INSUFFICIENT_POINTS',
        `Ödül havuzu için yeterli puanın yok. Gerekli: ${input.rewardPool.toLocaleString('tr-TR')} puan.`
      );
    }
    throw err;
  }
  return { battleId };
}

export async function respondChallenge(
  userId: string,
  battleId: string,
  action: 'accept' | 'reject'
): Promise<{ status: 'active' | 'cancelled'; refunded?: number; endTime?: string }> {
  const battle = await prisma.squadBattle.findUnique({
    where: { id: battleId },
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      challengedById: true,
      squad1: { select: { id: true, name: true, ownerId: true, isFrozen: true } },
      squad2: { select: { id: true, name: true, ownerId: true, isFrozen: true } },
    },
  });
  if (!battle) throw squadError('BATTLE_NOT_FOUND');
  if (battle.squad2.ownerId !== userId) throw squadError('NOT_SQUAD_OWNER', 'Bu meydan okumaya yalnız rakip klanın lideri yanıt verebilir.');
  if (battle.status !== 'pending') throw squadError('BATTLE_NOT_PENDING');

  if (action === 'reject') {
    const r = await cancelSquadBattle(prisma, battleId, {
      actorId: userId,
      actorRole: 'owner',
      reason: 'Rakip klan meydan okumayı reddetti',
      fromStatuses: ['pending'],
    });
    if (r.status === 'noop') throw squadError('BATTLE_NOT_PENDING');
    return { status: 'cancelled', refunded: r.refunded };
  }

  const now = new Date();
  if (battle.endTime.getTime() <= now.getTime()) {
    await resolveExpiredBattles([battle.squad1.id, battle.squad2.id], now);
    throw squadError('BATTLE_NOT_PENDING', 'Bu meydan okumanın süresi doldu.');
  }
  if (battle.squad1.isFrozen || battle.squad2.isFrozen) throw squadError('SQUAD_FROZEN');

  const durationMs = Math.max(battle.endTime.getTime() - battle.startTime.getTime(), 3600_000);
  const newEnd = new Date(now.getTime() + durationMs);

  const memberIds = await prisma.$transaction(async (tx) => {
    const claim = await tx.squadBattle.updateMany({
      where: { id: battleId, status: 'pending' },
      data: { status: 'active', startTime: now, endTime: newEnd, acceptedAt: now },
    });
    if (claim.count === 0) return null;
    // Kadro kabul anında, AYNI transaction'da donar (Bulgu 6).
    const members = await tx.squadMember.findMany({
      where: { squadId: { in: [battle.squad1.id, battle.squad2.id] } },
      select: { userId: true, squadId: true },
    });
    if (members.length > 0) {
      await tx.squadBattleParticipant.createMany({
        data: members.map((m) => ({ battleId, squadId: m.squadId, userId: m.userId })),
        skipDuplicates: true,
      });
    }
    return members.map((m) => m.userId);
  });
  if (!memberIds) throw squadError('BATTLE_NOT_PENDING');

  // Bildirim: iki klanın bütün kadrosu (savaşı yalnız lider değil herkes bilmeli).
  const recipients = Array.from(new Set([...memberIds, battle.challengedById].filter((x): x is string => !!x)));
  if (recipients.length > 0) {
    await prisma.notification.createMany({
      data: recipients.map((uid) => ({
        userId: uid,
        title: 'Klan savaşı başladı',
        message: `${battle.squad1.name} – ${battle.squad2.name} savaşı başladı. Geri bildirimlerinle klanına puan kazandır!`,
        type: 'success',
        data: { battleId, kind: 'squad_battle_started', href: SQUADS_HREF } as Prisma.InputJsonObject,
      })),
    });
  }
  return { status: 'active', endTime: newEnd.toISOString() };
}

export async function withdrawChallenge(userId: string, battleId: string): Promise<{ refunded: number }> {
  const battle = await prisma.squadBattle.findUnique({
    where: { id: battleId },
    select: { id: true, status: true, challengedById: true, squad1: { select: { ownerId: true } } },
  });
  if (!battle) throw squadError('BATTLE_NOT_FOUND');
  if (battle.challengedById !== userId && battle.squad1.ownerId !== userId) {
    throw squadError('NOT_SQUAD_OWNER', 'Meydan okumayı yalnız gönderen klanın lideri geri çekebilir.');
  }
  if (battle.status !== 'pending') throw squadError('BATTLE_NOT_PENDING');
  const r = await cancelSquadBattle(prisma, battleId, {
    actorId: userId,
    actorRole: 'owner',
    reason: 'Meydan okuyan klan geri çekti',
    fromStatuses: ['pending'],
  });
  if (r.status === 'noop') throw squadError('BATTLE_NOT_PENDING');
  return { refunded: r.refunded };
}

// ───────────────────────────── Okuma DTO'ları ─────────────────────────────

const RESULT_SELECT = {
  id: true,
  status: true,
  squad1Id: true,
  squad2Id: true,
  squad1Score: true,
  squad2Score: true,
  winnerId: true,
  rewardPool: true,
  rewardFunded: true,
  cancelReason: true,
  cancelledAt: true,
  paidOutAt: true,
  endTime: true,
  updatedAt: true,
  squad1: { select: { id: true, name: true } },
  squad2: { select: { id: true, name: true } },
} satisfies Prisma.SquadBattleSelect;

type ResultRow = Prisma.SquadBattleGetPayload<{ select: typeof RESULT_SELECT }>;

function toResultDto(b: ResultRow, mySquadId: string, myPayout: number): BattleResultDto {
  const mineIs1 = b.squad1Id === mySquadId;
  const mine = mineIs1 ? { ...b.squad1, score: b.squad1Score } : { ...b.squad2, score: b.squad2Score };
  const opponent = mineIs1 ? { ...b.squad2, score: b.squad2Score } : { ...b.squad1, score: b.squad1Score };
  const outcome: BattleResultDto['outcome'] =
    b.status === 'cancelled' ? 'cancelled' : !b.winnerId ? 'draw' : b.winnerId === mySquadId ? 'won' : 'lost';
  const endedAt = b.status === 'cancelled' ? (b.cancelledAt ?? b.updatedAt) : (b.paidOutAt ?? b.endTime);
  return {
    id: b.id,
    status: b.status === 'cancelled' ? 'cancelled' : 'completed',
    outcome,
    endedAt: endedAt.toISOString(),
    mine,
    opponent,
    rewardPool: b.rewardPool,
    rewardFunded: b.rewardFunded,
    cancelReason: b.cancelReason,
    myPayout,
  };
}

/** Güncel (bekleyen/aktif) savaş + son 72 saatte biten savaşın sonucu. */
export async function getBattleState(
  squadId: string,
  userId: string,
  isOwner: boolean,
  now: Date = new Date()
): Promise<BattleState> {
  await resolveExpiredBattles([squadId], now);

  const [open, recent] = await Promise.all([
    prisma.squadBattle.findFirst({
      where: {
        status: { in: [...OPEN_BATTLE_STATUSES] },
        endTime: { gt: now },
        OR: [{ squad1Id: squadId }, { squad2Id: squadId }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        startTime: true,
        endTime: true,
        acceptedAt: true,
        rewardPool: true,
        rewardFunded: true,
        challengedById: true,
        squad1Score: true,
        squad2Score: true,
        squad1: { select: { id: true, name: true } },
        squad2: { select: { id: true, name: true } },
      },
    }),
    prisma.squadBattle.findFirst({
      where: {
        status: { in: ['completed', 'cancelled'] },
        updatedAt: { gte: new Date(now.getTime() - BATTLE_RESULT_VISIBLE_MS) },
        OR: [{ squad1Id: squadId }, { squad2Id: squadId }],
      },
      orderBy: { updatedAt: 'desc' },
      select: RESULT_SELECT,
    }),
  ]);

  let battle: CurrentBattleDto | null = null;
  if (open) {
    const isChallenger = open.squad1.id === squadId;
    const mine = isChallenger
      ? { ...open.squad1, score: open.squad1Score }
      : { ...open.squad2, score: open.squad2Score };
    const opponent = isChallenger
      ? { ...open.squad2, score: open.squad2Score }
      : { ...open.squad1, score: open.squad1Score };
    let topContributors: CurrentBattleDto['topContributors'] = [];
    let myContribution: number | null = null;
    let amParticipant = false;
    if (open.status === 'active') {
      const [top, me] = await Promise.all([
        prisma.squadBattleParticipant.findMany({
          where: { battleId: open.id, score: { gt: 0 } },
          orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
          take: 6,
          select: { score: true, squadId: true, userId: true, user: { select: { name: true, image: true } } },
        }),
        prisma.squadBattleParticipant.findUnique({
          where: { battleId_userId: { battleId: open.id, userId } },
          select: { score: true, squadId: true },
        }),
      ]);
      topContributors = top.map((p) => ({
        name: (p.user.name ?? '').trim() || 'Üye',
        image: p.user.image,
        score: p.score,
        side: p.squadId === squadId ? 'mine' : 'theirs',
        isMe: p.userId === userId,
      }));
      amParticipant = !!me && me.squadId === squadId;
      myContribution = amParticipant ? me!.score : null;
    }
    battle = {
      id: open.id,
      status: open.status === 'active' ? 'active' : 'pending',
      createdAt: open.createdAt.toISOString(),
      startTime: open.startTime.toISOString(),
      endTime: open.endTime.toISOString(),
      acceptedAt: open.acceptedAt ? open.acceptedAt.toISOString() : null,
      rewardPool: open.rewardPool,
      rewardFunded: open.rewardFunded,
      isChallenger,
      canRespond: open.status === 'pending' && isOwner && !isChallenger,
      canWithdraw: open.status === 'pending' && isChallenger && (isOwner || open.challengedById === userId),
      amParticipant,
      myContribution,
      mine,
      opponent,
      topContributors,
    };
  }

  let recentResult: BattleResultDto | null = null;
  if (recent) {
    const payout = await prisma.pointsLedger.findUnique({
      where: { idempotencyKey: `squad-payout:${recent.id}:${userId}` },
      select: { delta: true, status: true },
    });
    recentResult = toResultDto(recent, squadId, payout && payout.status === 'posted' ? payout.delta : 0);
  }
  return { battle, recentResult };
}

/** Kullanıcının klanının biten savaşları (imleçli sayfalama). */
export async function getBattleHistory(userId: string, cursor: string | null, limit = 10): Promise<BattleHistoryPage> {
  const membership = await membershipOf(prisma, userId);
  if (!membership) return { items: [], nextCursor: null };
  const squadId = membership.squadId;
  const rows = await prisma.squadBattle.findMany({
    where: { status: { in: ['completed', 'cancelled'] }, OR: [{ squad1Id: squadId }, { squad2Id: squadId }] },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: RESULT_SELECT,
  });
  const page = rows.slice(0, limit);
  const payouts = page.length
    ? await prisma.pointsLedger.findMany({
        where: { idempotencyKey: { in: page.map((b) => `squad-payout:${b.id}:${userId}`) }, status: 'posted' },
        select: { idempotencyKey: true, delta: true },
      })
    : [];
  const byKey = new Map(payouts.map((p) => [p.idempotencyKey, p.delta]));
  return {
    items: page.map((b) => toResultDto(b, squadId, byKey.get(`squad-payout:${b.id}:${userId}`) ?? 0)),
    nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/** Rakip arama (ad içerir; askıdakiler ve kendi klanın hariç). */
export async function searchSquads(userId: string, q: string, limit = 8): Promise<SquadSearchResult[]> {
  const membership = await membershipOf(prisma, userId);
  const now = new Date();
  const rows = await prisma.squad.findMany({
    where: {
      isFrozen: false,
      ...(membership ? { id: { not: membership.squadId } } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    },
    orderBy: [{ totalPoints: 'desc' }, { createdAt: 'asc' }],
    take: limit,
    select: {
      id: true,
      name: true,
      totalPoints: true,
      treasuryPoints: true,
      _count: { select: { members: true } },
    },
  });
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const busy = await prisma.squadBattle.findMany({
    where: {
      status: { in: [...OPEN_BATTLE_STATUSES] },
      endTime: { gt: now },
      OR: [{ squad1Id: { in: ids } }, { squad2Id: { in: ids } }],
    },
    select: { squad1Id: true, squad2Id: true },
  });
  const busyIds = new Set(busy.flatMap((b) => [b.squad1Id, b.squad2Id]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    totalPoints: r.totalPoints,
    level: squadLevel(r.treasuryPoints).level,
    memberCount: r._count.members,
    busy: busyIds.has(r.id),
  }));
}
