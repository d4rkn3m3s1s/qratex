/**
 * Klan odası BFF'i — sayfanın ilk render'ı (SSR) ve `GET /api/customer/squads/overview`
 * aynı fonksiyonu kullanır: tek çağrıda kimlik + hafta + savaş + kadro + lig + günlük.
 *
 * Gizlilik (Bulgu 8): üyelerin cüzdan bakiyesi artık diğer üyelere gösterilmez; kadro
 * yalnız gerçek klan katkısını (bu hafta, katılımdan sonraki geri bildirimler) ve aktif
 * savaştaki skoru taşır. Bakiye yalnız izleyicinin kendisine (meydan okuma fişi için) döner.
 */
import { prisma } from '@/lib/prisma';
import { cachedJson } from '@/lib/redis';
import { SQUAD_MAX_MEMBERS, squadLevel } from './rules';
import { computeWeeklyGoal, hasClaimedWeeklyGoal, toWeeklyGoalDto } from './goal';
import { getBattleState } from './battles';
import { membershipOf } from './membership';
import type {
  SquadActivityDto,
  SquadLeague,
  SquadLeagueRow,
  SquadMemberDto,
  SquadOverview,
} from './dto';

const LEAGUE_CACHE_KEY = 'squads:league:top10:v2';
const LEAGUE_CACHE_TTL_S = 60;
const ACTIVITY_WINDOW_MS = 30 * 86_400_000;

type LeagueTop = { top: SquadLeagueRow[]; total: number };

async function loadLeagueTop(): Promise<LeagueTop> {
  const [rows, total] = await Promise.all([
    prisma.squad.findMany({
      where: { isFrozen: false },
      orderBy: [{ totalPoints: 'desc' }, { createdAt: 'asc' }],
      take: 10,
      select: { id: true, name: true, totalPoints: true, treasuryPoints: true, _count: { select: { members: true } } },
    }),
    prisma.squad.count({ where: { isFrozen: false } }),
  ]);
  return {
    total,
    top: rows.map((r, i) => ({
      id: r.id,
      name: r.name,
      totalPoints: r.totalPoints,
      level: squadLevel(r.treasuryPoints).level,
      memberCount: r._count.members,
      rank: i + 1,
    })),
  };
}

/** Global klan ligi: top-10 (60 sn önbellek) + kendi klanının gerçek sırası (önbelleksiz). */
export async function getLeague(
  mine: { id: string; name: string; totalPoints: number; treasuryPoints: number; memberCount: number; isFrozen: boolean } | null
): Promise<SquadLeague> {
  let league: LeagueTop;
  try {
    league = await cachedJson(LEAGUE_CACHE_KEY, LEAGUE_CACHE_TTL_S, loadLeagueTop);
  } catch {
    league = await loadLeagueTop();
  }
  let mineRow: SquadLeagueRow | null = null;
  if (mine && !mine.isFrozen) {
    const inTop = league.top.find((r) => r.id === mine.id);
    const ahead = await prisma.squad.count({ where: { isFrozen: false, totalPoints: { gt: mine.totalPoints } } });
    mineRow = {
      id: mine.id,
      name: mine.name,
      totalPoints: mine.totalPoints,
      level: squadLevel(mine.treasuryPoints).level,
      memberCount: mine.memberCount,
      rank: inTop?.rank ?? ahead + 1,
    };
  }
  return { top: league.top, total: league.total, mine: mineRow };
}

/** Klan günlüğü: katılımlar, lider/ad/kod değişiklikleri (AuditLog) ve savaş olayları. */
export async function getSquadActivity(
  squadId: string,
  members: ReadonlyArray<{ userId: string; name: string; joinedAt: Date }>,
  now: Date = new Date()
): Promise<SquadActivityDto[]> {
  const since = new Date(now.getTime() - ACTIVITY_WINDOW_MS);
  const [audits, battles] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        entity: 'Squad',
        entityId: squadId,
        createdAt: { gte: since },
        action: {
          in: [
            'SQUAD_CREATE',
            'SQUAD_MEMBER_LEAVE',
            'SQUAD_MEMBER_KICK',
            'SQUAD_OWNERSHIP_TRANSFER',
            'SQUAD_UPDATE',
            'SQUAD_INVITE_ROTATE',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, action: true, userId: true, newData: true, createdAt: true },
    }),
    prisma.squadBattle.findMany({
      where: { OR: [{ squad1Id: squadId }, { squad2Id: squadId }], updatedAt: { gte: since } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        squad1Id: true,
        winnerId: true,
        createdAt: true,
        acceptedAt: true,
        cancelledAt: true,
        paidOutAt: true,
        squad1: { select: { name: true } },
        squad2: { select: { name: true } },
      },
    }),
  ]);

  const nameById = new Map(members.map((m) => [m.userId, m.name]));
  const missing = new Set<string>();
  for (const a of audits) {
    const d = (a.newData ?? {}) as Record<string, unknown>;
    for (const id of [a.userId, d.userId, d.toUserId]) {
      if (typeof id === 'string' && !nameById.has(id)) missing.add(id);
    }
  }
  if (missing.size > 0) {
    const users = await prisma.user.findMany({ where: { id: { in: [...missing] } }, select: { id: true, name: true } });
    for (const u of users) nameById.set(u.id, (u.name ?? '').trim() || 'Bir üye');
  }
  const who = (id: unknown, fallback?: unknown) =>
    (typeof fallback === 'string' && fallback) || (typeof id === 'string' ? (nameById.get(id) ?? 'Bir üye') : null);

  const items: SquadActivityDto[] = [];
  for (const m of members) {
    if (m.joinedAt >= since) {
      items.push({ id: `join:${m.userId}`, at: m.joinedAt.toISOString(), kind: 'joined', actor: m.name, detail: null });
    }
  }
  for (const a of audits) {
    const d = (a.newData ?? {}) as Record<string, unknown>;
    const at = a.createdAt.toISOString();
    switch (a.action) {
      case 'SQUAD_CREATE':
        items.push({ id: a.id, at, kind: 'created', actor: who(a.userId), detail: null });
        break;
      case 'SQUAD_MEMBER_LEAVE':
        items.push({ id: a.id, at, kind: 'left', actor: who(d.userId ?? a.userId, d.name), detail: null });
        break;
      case 'SQUAD_MEMBER_KICK':
        items.push({ id: a.id, at, kind: 'kicked', actor: who(d.userId, d.name), detail: null });
        break;
      case 'SQUAD_OWNERSHIP_TRANSFER':
        items.push({ id: a.id, at, kind: 'leader', actor: who(d.toUserId, d.toName), detail: null });
        break;
      case 'SQUAD_UPDATE':
        if (typeof d.name === 'string') items.push({ id: a.id, at, kind: 'renamed', actor: who(a.userId), detail: d.name });
        else if (typeof d.goalTier === 'number')
          items.push({ id: a.id, at, kind: 'goal_changed', actor: who(a.userId), detail: String(d.goalTier) });
        break;
      case 'SQUAD_INVITE_ROTATE':
        items.push({ id: a.id, at, kind: 'invite_rotated', actor: who(a.userId), detail: null });
        break;
    }
  }
  for (const b of battles) {
    const mineIs1 = b.squad1Id === squadId;
    const opponent = mineIs1 ? b.squad2.name : b.squad1.name;
    if (b.createdAt >= since) {
      items.push({
        id: `ch:${b.id}`,
        at: b.createdAt.toISOString(),
        kind: mineIs1 ? 'challenge_sent' : 'challenge_received',
        actor: opponent,
        detail: null,
      });
    }
    if (b.acceptedAt && b.acceptedAt >= since) {
      items.push({ id: `st:${b.id}`, at: b.acceptedAt.toISOString(), kind: 'battle_started', actor: opponent, detail: null });
    }
    if (b.status === 'completed' && b.paidOutAt) {
      const kind = !b.winnerId ? 'battle_draw' : b.winnerId === squadId ? 'battle_won' : 'battle_lost';
      items.push({ id: `en:${b.id}`, at: b.paidOutAt.toISOString(), kind, actor: opponent, detail: null });
    }
    if (b.status === 'cancelled' && b.cancelledAt) {
      items.push({ id: `cx:${b.id}`, at: b.cancelledAt.toISOString(), kind: 'battle_cancelled', actor: opponent, detail: null });
    }
  }
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 20);
}

/** Klan odasının tamamı (ya da klansız kullanıcı için keşif). */
export async function getSquadOverview(userId: string, now: Date = new Date()): Promise<SquadOverview> {
  const [membership, viewer] = await Promise.all([
    membershipOf(prisma, userId),
    prisma.user.findUnique({ where: { id: userId }, select: { points: true } }),
  ]);
  const balance = viewer?.points ?? 0;

  if (!membership) {
    return { state: 'none', viewer: { userId, balance }, league: await getLeague(null) };
  }

  const squad = await prisma.squad.findUnique({
    where: { id: membership.squadId },
    select: {
      id: true,
      name: true,
      description: true,
      inviteCode: true,
      isFrozen: true,
      totalPoints: true,
      treasuryPoints: true,
      weeklyTeamTarget: true,
      ownerId: true,
      createdAt: true,
      members: {
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        select: { userId: true, joinedAt: true, user: { select: { name: true, image: true } } },
      },
    },
  });
  if (!squad) {
    return { state: 'none', viewer: { userId, balance }, league: await getLeague(null) };
  }

  const isOwner = squad.ownerId === userId;
  const members = squad.members.map((m) => ({
    userId: m.userId,
    joinedAt: m.joinedAt,
    name: (m.user.name ?? '').trim() || 'Üye',
    image: m.user.image,
  }));

  const goal = await computeWeeklyGoal(prisma, squad, members, now);
  const [claimed, battle, league, activity] = await Promise.all([
    hasClaimedWeeklyGoal(prisma, goal.weekKey, userId),
    getBattleState(squad.id, userId, isOwner, now),
    getLeague({
      id: squad.id,
      name: squad.name,
      totalPoints: squad.totalPoints,
      treasuryPoints: squad.treasuryPoints,
      memberCount: members.length,
      isFrozen: squad.isFrozen,
    }),
    getSquadActivity(squad.id, members, now),
  ]);

  // Aktif savaştaki kişisel skorlar (kadro).
  const battleScores = new Map<string, number>();
  if (battle.battle?.status === 'active') {
    const parts = await prisma.squadBattleParticipant.findMany({
      where: { battleId: battle.battle.id, squadId: squad.id },
      select: { userId: true, score: true },
    });
    for (const p of parts) battleScores.set(p.userId, p.score);
  }

  const memberDtos: SquadMemberDto[] = members
    .map((m) => ({
      userId: m.userId,
      name: m.name,
      image: m.image,
      isOwner: m.userId === squad.ownerId,
      isMe: m.userId === userId,
      joinedAt: m.joinedAt.toISOString(),
      weekContributions: goal.contributions.get(m.userId) ?? 0,
      battleScore: battleScores.has(m.userId) ? battleScores.get(m.userId)! : null,
    }))
    .sort(
      (a, b) =>
        b.weekContributions - a.weekContributions ||
        (b.battleScore ?? 0) - (a.battleScore ?? 0) ||
        a.joinedAt.localeCompare(b.joinedAt)
    );

  const lvl = squadLevel(squad.treasuryPoints);
  return {
    state: 'member',
    viewer: { userId, balance, isOwner, joinedAt: membership.joinedAt.toISOString() },
    squad: {
      id: squad.id,
      name: squad.name,
      description: squad.description,
      inviteCode: squad.inviteCode,
      isFrozen: squad.isFrozen,
      totalPoints: squad.totalPoints,
      power: squad.treasuryPoints,
      level: lvl.level,
      levelProgress: lvl.progress,
      nextLevelAt: lvl.next,
      memberCount: members.length,
      maxMembers: SQUAD_MAX_MEMBERS,
      ownerId: squad.ownerId,
      createdAt: squad.createdAt.toISOString(),
    },
    members: memberDtos,
    weeklyGoal: toWeeklyGoalDto(goal, userId, claimed, squad.isFrozen),
    battle,
    league,
    activity,
  };
}
