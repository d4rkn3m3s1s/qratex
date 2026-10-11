/**
 * Klan Merkezi — okuma tarafı (sunucu). Sayfa sunucu bileşeni ve BFF uçları aynı yükleyicileri
 * çağırır. Hata yutulmaz: düşen kaynak çağırana fırlar (QueryState görünür hata gösterir).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { OPEN_BATTLE_STATUSES } from '@/lib/squad-battle-service';
import {
  battleView,
  type BattleDetail,
  type BattleListItem,
  type BattleListPage,
  type BattleListQuery,
  type BattleViewStatus,
  type SquadAuditPage,
  type SquadAuditRow,
  type SquadDetail,
  type SquadListItem,
  type SquadListPage,
  type SquadListQuery,
  type SquadOption,
  type SquadStats,
  SQUAD_DEFAULT_SORT,
} from './contract';

const DAY = 86_400_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ───────────────────────────── Klan listesi ─────────────────────────────

export function squadWhere(f: Pick<SquadListQuery, 'q' | 'status'>, now: Date = new Date()): Prisma.SquadWhereInput {
  const and: Prisma.SquadWhereInput[] = [];
  if (f.q) {
    and.push({
      OR: [
        { name: { contains: f.q, mode: 'insensitive' } },
        { inviteCode: { contains: f.q, mode: 'insensitive' } },
        { id: f.q },
        { owner: { email: { contains: f.q, mode: 'insensitive' } } },
        { owner: { name: { contains: f.q, mode: 'insensitive' } } },
      ],
    });
  }
  if (f.status === 'frozen') and.push({ isFrozen: true });
  if (f.status === 'active') and.push({ isFrozen: false });
  if (f.status === 'in_battle') {
    const open: Prisma.SquadBattleWhereInput = { status: 'active', endTime: { gt: now } };
    and.push({ OR: [{ battlesAsSquad1: { some: open } }, { battlesAsSquad2: { some: open } }] });
  }
  return and.length ? { AND: and } : {};
}

export function squadOrderBy(sort: string | undefined): Prisma.SquadOrderByWithRelationInput[] {
  const [id, dir] = (sort ?? SQUAD_DEFAULT_SORT).split('.') as [string, 'asc' | 'desc'];
  const d: Prisma.SortOrder = dir === 'asc' ? 'asc' : 'desc';
  const primary: Prisma.SquadOrderByWithRelationInput =
    id === 'members'
      ? { members: { _count: d } }
      : id === 'totalPoints'
        ? { totalPoints: d }
        : id === 'treasuryPoints'
          ? { treasuryPoints: d }
          : id === 'name'
            ? { name: d }
            : { createdAt: d };
  // Kararlı sayfalama: eşitlikte kimlik.
  return [primary, { id: 'asc' }];
}

const listSelect = {
  id: true,
  name: true,
  description: true,
  inviteCode: true,
  isFrozen: true,
  createdAt: true,
  totalPoints: true,
  treasuryPoints: true,
  owner: { select: { id: true, name: true, email: true } },
  _count: { select: { members: true } },
} satisfies Prisma.SquadSelect;

type ListRow = Prisma.SquadGetPayload<{ select: typeof listSelect }>;

async function openBattlesFor(ids: string[]): Promise<Map<string, { id: string; status: 'pending' | 'active' }>> {
  const map = new Map<string, { id: string; status: 'pending' | 'active' }>();
  if (ids.length === 0) return map;
  const rows = await prisma.squadBattle.findMany({
    where: {
      status: { in: [...OPEN_BATTLE_STATUSES] },
      OR: [{ squad1Id: { in: ids } }, { squad2Id: { in: ids } }],
    },
    select: { id: true, status: true, squad1Id: true, squad2Id: true },
    orderBy: { createdAt: 'desc' },
  });
  for (const b of rows) {
    const v = { id: b.id, status: b.status === 'active' ? ('active' as const) : ('pending' as const) };
    for (const sid of [b.squad1Id, b.squad2Id]) if (!map.has(sid)) map.set(sid, v);
  }
  return map;
}

function toListItem(r: ListRow, open: Map<string, { id: string; status: 'pending' | 'active' }>): SquadListItem {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    inviteCode: r.inviteCode,
    isFrozen: r.isFrozen,
    createdAt: r.createdAt.toISOString(),
    owner: r.owner,
    memberCount: r._count.members,
    totalPoints: r.totalPoints,
    treasuryPoints: r.treasuryPoints,
    openBattle: open.get(r.id) ?? null,
  };
}

export async function listSquads(q: SquadListQuery): Promise<SquadListPage> {
  const where = squadWhere(q);
  const [rows, total] = await Promise.all([
    prisma.squad.findMany({
      where,
      select: listSelect,
      orderBy: squadOrderBy(q.sort),
      skip: (q.page - 1) * q.size,
      take: q.size,
    }),
    prisma.squad.count({ where }),
  ]);
  const open = await openBattlesFor(rows.map((r) => r.id));
  return { items: rows.map((r) => toListItem(r, open)), total, page: q.page, size: q.size };
}

/** CSV için sayfalı tarayıcı (bellek sınırlı). */
export async function* iterateSquadExport(
  f: Pick<SquadListQuery, 'q' | 'status' | 'sort'>,
  max: number
): AsyncGenerator<SquadListItem[]> {
  const where = squadWhere(f);
  const orderBy = squadOrderBy(f.sort);
  let skip = 0;
  const batch = 500;
  while (skip < max) {
    const rows = await prisma.squad.findMany({ where, select: listSelect, orderBy, skip, take: Math.min(batch, max - skip) });
    if (rows.length === 0) break;
    const open = await openBattlesFor(rows.map((r) => r.id));
    yield rows.map((r) => toListItem(r, open));
    skip += rows.length;
    if (rows.length < batch) break;
  }
}

export const SQUAD_EXPORT_HEADER = [
  'Klan kimliği',
  'Klan adı',
  'Durum',
  'Lider adı',
  'Lider e-postası',
  'Üye sayısı',
  'Klan puanı',
  'Klan gücü (hazine)',
  'Açık savaş',
  'Davet kodu',
  'Kuruluş (Europe/Istanbul)',
] as const;

const TR_DATETIME = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function squadExportRow(s: SquadListItem): unknown[] {
  return [
    s.id,
    s.name,
    s.isFrozen ? 'Dondurulmuş' : 'Etkin',
    s.owner.name ?? '',
    s.owner.email,
    s.memberCount,
    s.totalPoints,
    s.treasuryPoints,
    s.openBattle ? (s.openBattle.status === 'active' ? 'Savaşta' : 'Bekleyen davet') : '',
    s.inviteCode,
    TR_DATETIME.format(new Date(s.createdAt)),
  ];
}

// ───────────────────────────── KPI ─────────────────────────────

export async function getSquadStats(now: Date = new Date()): Promise<SquadStats> {
  const since7 = new Date(now.getTime() - 7 * DAY);
  const [total, frozen, newLast7d, totalMembers, live, pending, overdue, escrow, ledger7, activeRows] = await Promise.all([
    prisma.squad.count(),
    prisma.squad.count({ where: { isFrozen: true } }),
    prisma.squad.count({ where: { createdAt: { gte: since7 } } }),
    prisma.squadMember.count(),
    prisma.squadBattle.count({ where: { status: 'active', endTime: { gt: now } } }),
    prisma.squadBattle.count({ where: { status: 'pending', endTime: { gt: now } } }),
    prisma.squadBattle.count({ where: { status: { in: [...OPEN_BATTLE_STATUSES] }, endTime: { lte: now } } }),
    prisma.squadBattle.aggregate({
      where: { status: { in: [...OPEN_BATTLE_STATUSES] }, rewardFunded: true, rewardRefunded: false },
      _sum: { rewardPool: true },
    }),
    prisma.pointsLedger.groupBy({
      by: ['source'],
      where: { source: { in: ['squad_battle', 'squad_escrow_refund'] }, status: 'posted', createdAt: { gte: since7 } },
      _sum: { delta: true },
    }),
    prisma.$queryRaw<Array<{ n: bigint | number }>>`
      SELECT COUNT(DISTINCT sm."squadId") AS n
      FROM "SquadMember" sm
      JOIN "PointsLedger" pl ON pl."userId" = sm."userId"
      WHERE pl."createdAt" >= ${since7} AND pl."delta" > 0 AND pl."status" = 'posted'`,
  ]);
  const sumOf = (src: string) => Number(ledger7.find((r) => r.source === src)?._sum.delta ?? 0);
  return {
    total,
    frozen,
    newLast7d,
    activeLast7d: Number(activeRows[0]?.n ?? 0),
    totalMembers,
    avgMembers: total > 0 ? Math.round((totalMembers / total) * 10) / 10 : 0,
    battles: {
      live,
      pending,
      overdue,
      escrowLocked: escrow._sum.rewardPool ?? 0,
      paidOut7d: sumOf('squad_battle'),
      refunded7d: sumOf('squad_escrow_refund'),
    },
    generatedAt: now.toISOString(),
  };
}

// ───────────────────────────── Denetim satırları ─────────────────────────────

function pickReason(newData: unknown): string | null {
  if (newData && typeof newData === 'object' && 'reason' in newData) {
    const r = (newData as { reason?: unknown }).reason;
    return typeof r === 'string' ? r : null;
  }
  return null;
}

async function auditRows(entity: 'Squad' | 'SquadBattle', ids: string[], take = 40): Promise<SquadAuditRow[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.auditLog.findMany({
    where: { entity, entityId: { in: ids } },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      action: true,
      createdAt: true,
      newData: true,
      actorType: true,
      user: { select: { name: true, email: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorName: r.user ? r.user.name || r.user.email : r.actorType === 'user' ? null : 'Sistem',
    createdAt: r.createdAt.toISOString(),
    reason: pickReason(r.newData),
    data: r.newData && typeof r.newData === 'object' && !Array.isArray(r.newData) ? (r.newData as Record<string, unknown>) : null,
  }));
}

// ───────────────────────────── Savaş satırı ─────────────────────────────

const battleSelect = {
  id: true,
  status: true,
  squad1Score: true,
  squad2Score: true,
  winnerId: true,
  rewardPool: true,
  rewardFunded: true,
  rewardRefunded: true,
  challengedById: true,
  startTime: true,
  endTime: true,
  acceptedAt: true,
  createdAt: true,
  cancelledAt: true,
  cancelReason: true,
  paidOutAt: true,
  squad1: { select: { id: true, name: true } },
  squad2: { select: { id: true, name: true } },
} satisfies Prisma.SquadBattleSelect;

type BattleRow = Prisma.SquadBattleGetPayload<{ select: typeof battleSelect }>;

export function toBattleItem(b: BattleRow, now: Date = new Date()): BattleListItem {
  return {
    id: b.id,
    status: b.status,
    view: battleView(b.status, b.endTime, now),
    origin: b.challengedById ? 'challenge' : 'admin',
    squad1: b.squad1,
    squad2: b.squad2,
    squad1Score: b.squad1Score,
    squad2Score: b.squad2Score,
    winnerId: b.winnerId,
    rewardPool: b.rewardPool,
    rewardFunded: b.rewardFunded,
    rewardRefunded: b.rewardRefunded,
    startTime: b.startTime.toISOString(),
    endTime: b.endTime.toISOString(),
    acceptedAt: iso(b.acceptedAt),
    createdAt: b.createdAt.toISOString(),
    cancelledAt: iso(b.cancelledAt),
    cancelReason: b.cancelReason,
    paidOutAt: iso(b.paidOutAt),
  };
}

export function battleViewWhere(view: BattleViewStatus | undefined, now: Date): Prisma.SquadBattleWhereInput {
  switch (view) {
    case 'live':
      return { status: 'active', endTime: { gt: now } };
    case 'pending':
      return { status: 'pending', endTime: { gt: now } };
    case 'overdue':
      return { status: { in: [...OPEN_BATTLE_STATUSES] }, endTime: { lte: now } };
    case 'completed':
      return { status: 'completed' };
    case 'cancelled':
      return { status: 'cancelled' };
    default:
      return {};
  }
}

export async function listBattles(q: BattleListQuery, now: Date = new Date()): Promise<BattleListPage> {
  const base: Prisma.SquadBattleWhereInput[] = [];
  if (q.squadId) base.push({ OR: [{ squad1Id: q.squadId }, { squad2Id: q.squadId }] });
  if (q.q) {
    base.push({
      OR: [
        { squad1: { name: { contains: q.q, mode: 'insensitive' } } },
        { squad2: { name: { contains: q.q, mode: 'insensitive' } } },
        { id: q.q },
      ],
    });
  }
  if (q.origin === 'admin') base.push({ challengedById: null });
  if (q.origin === 'challenge') base.push({ challengedById: { not: null } });

  const where: Prisma.SquadBattleWhereInput = { AND: [...base, battleViewWhere(q.status, now)] };
  const views: BattleViewStatus[] = ['live', 'pending', 'overdue', 'completed', 'cancelled'];
  const [rows, total, ...counts] = await Promise.all([
    prisma.squadBattle.findMany({
      where,
      select: battleSelect,
      // Canlı/bekleyen: biten ilk; geçmiş: en yeni ilk.
      orderBy: q.status === 'live' || q.status === 'pending' ? [{ endTime: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (q.page - 1) * q.size,
      take: q.size,
    }),
    prisma.squadBattle.count({ where }),
    ...views.map((v) => prisma.squadBattle.count({ where: { AND: [...base, battleViewWhere(v, now)] } })),
  ]);
  const countMap = Object.fromEntries(views.map((v, i) => [v, counts[i] ?? 0])) as Record<BattleViewStatus, number>;
  return { items: rows.map((r) => toBattleItem(r, now)), total, page: q.page, size: q.size, counts: countMap };
}

export async function getBattleDetail(id: string, now: Date = new Date()): Promise<BattleDetail | null> {
  const b = await prisma.squadBattle.findUnique({ where: { id }, select: battleSelect });
  if (!b) return null;
  const [participants, ledger, audit] = await Promise.all([
    prisma.squadBattleParticipant.findMany({
      where: { battleId: id },
      orderBy: [{ score: 'desc' }, { id: 'asc' }],
      take: 100,
      select: { userId: true, squadId: true, score: true, user: { select: { name: true } } },
    }),
    prisma.pointsLedger.findMany({
      where: { sourceId: id, source: { in: ['squad_escrow', 'squad_battle', 'squad_escrow_refund'] } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true, source: true, delta: true, status: true, userId: true, createdAt: true, user: { select: { name: true, email: true } } },
    }),
    auditRows('SquadBattle', [id]),
  ]);
  return {
    ...toBattleItem(b, now),
    participants: participants.map((p) => ({ userId: p.userId, name: p.user?.name ?? null, squadId: p.squadId, score: p.score })),
    ledger: ledger.map((l) => ({
      id: l.id,
      source: l.source,
      delta: l.delta,
      status: l.status,
      userId: l.userId,
      userName: l.user ? l.user.name || l.user.email : null,
      createdAt: l.createdAt.toISOString(),
    })),
    audit,
  };
}

// ───────────────────────────── Klan detayı ─────────────────────────────

export async function getSquadDetail(id: string, now: Date = new Date()): Promise<SquadDetail | null> {
  const s = await prisma.squad.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      inviteCode: true,
      isFrozen: true,
      createdAt: true,
      updatedAt: true,
      totalPoints: true,
      treasuryPoints: true,
      ownerId: true,
      owner: { select: { id: true, name: true, email: true } },
      members: {
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        take: 100,
        select: { userId: true, joinedAt: true, user: { select: { name: true, email: true, points: true } } },
      },
    },
  });
  if (!s) return null;
  const battleWhere: Prisma.SquadBattleWhereInput = { OR: [{ squad1Id: id }, { squad2Id: id }] };
  const [battles, completed, cancelled, audit] = await Promise.all([
    prisma.squadBattle.findMany({ where: battleWhere, select: battleSelect, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.squadBattle.findMany({ where: { AND: [battleWhere, { status: 'completed' }] }, select: { winnerId: true } }),
    prisma.squadBattle.count({ where: { AND: [battleWhere, { status: 'cancelled' }] } }),
    auditRows('Squad', [id]),
  ]);
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const b of completed) {
    if (!b.winnerId) draws++;
    else if (b.winnerId === id) wins++;
    else losses++;
  }
  const lastFreeze = s.isFrozen ? audit.find((a) => a.action === 'SQUAD_FREEZE') : undefined;
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    inviteCode: s.inviteCode,
    isFrozen: s.isFrozen,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    totalPoints: s.totalPoints,
    treasuryPoints: s.treasuryPoints,
    owner: s.owner,
    members: s.members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      points: m.user.points,
      joinedAt: m.joinedAt.toISOString(),
      isOwner: m.userId === s.ownerId,
    })),
    record: { wins, losses, draws, cancelled },
    battles: battles.map((b) => toBattleItem(b, now)),
    audit,
    freeze: lastFreeze ? { at: lastFreeze.createdAt, reason: lastFreeze.reason, by: lastFreeze.actorName } : s.isFrozen ? { at: s.updatedAt.toISOString(), reason: null, by: null } : null,
  };
}

// ───────────────────────────── Klan seçici ─────────────────────────────

export async function squadOptions(q: string | undefined, now: Date = new Date()): Promise<SquadOption[]> {
  const rows = await prisma.squad.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { inviteCode: { contains: q, mode: 'insensitive' } }] } : {},
    select: { id: true, name: true, isFrozen: true, _count: { select: { members: true } } },
    orderBy: [{ totalPoints: 'desc' }, { id: 'asc' }],
    take: 20,
  });
  const ids = rows.map((r) => r.id);
  const open = ids.length
    ? await prisma.squadBattle.findMany({
        where: { status: { in: [...OPEN_BATTLE_STATUSES] }, endTime: { gt: now }, OR: [{ squad1Id: { in: ids } }, { squad2Id: { in: ids } }] },
        select: { squad1Id: true, squad2Id: true },
      })
    : [];
  const busy = new Set(open.flatMap((b) => [b.squad1Id, b.squad2Id]));
  return rows.map((r) => ({ id: r.id, name: r.name, memberCount: r._count.members, isFrozen: r.isFrozen, hasOpenBattle: busy.has(r.id) }));
}

// ───────────────────────────── Moderasyon günlüğü ─────────────────────────────

export async function listSquadAudit(page: number, size: number): Promise<SquadAuditPage> {
  const where: Prisma.AuditLogWhereInput = { entity: { in: ['Squad', 'SquadBattle'] } };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * size,
      take: size,
      select: { id: true, action: true, entity: true, entityId: true, createdAt: true, newData: true, actorType: true, user: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      actorName: r.user ? r.user.name || r.user.email : r.actorType === 'user' ? null : 'Sistem',
      createdAt: r.createdAt.toISOString(),
      reason: pickReason(r.newData),
      data: r.newData && typeof r.newData === 'object' && !Array.isArray(r.newData) ? (r.newData as Record<string, unknown>) : null,
    })),
    total,
    page,
    size,
  };
}
