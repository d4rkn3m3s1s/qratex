/**
 * Admin → Görev Yönetimi — sunucu tarafı (okuma + yazma). Sayfa sunucu bileşeni ve BFF uçları
 * (app/api/admin/quests/**) aynı fonksiyonları çağırır. Hata yutulmaz: düşen kaynak çağırana
 * fırlar ve istemci görünür hata + "Tekrar dene" gösterir ("200 + sıfırlar" yok).
 *
 * Puan: bu modül HİÇ puan basmaz. Görev ödülü müşteri tarafında claim motoru
 * (lib/quests/claim.ts → lib/economy mintPoints) ya da otomatik yollar (rewardQuestOnce) ile
 * ödenir; burada yalnız tanım yazılır ve defter (PointsLedger) OKUNUR.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { getPointsMatrix, getQuestReward, type PointsMatrix } from '@/lib/points-rules';
import { getModuleControls } from '@/lib/module-gate';
import { ACHIEVEMENT_QUEST_IDS } from '@/lib/quests/reward';
import { mechanicTracking, parseRequirement, resolveMechanic, type QuestMechanic } from '@/lib/quests/mechanics';
import { getQuestPeriod, questPeriodKind, storedCompletionInPeriod, rewardedInPeriod, istanbulDayKey } from '@/lib/quests/period';
import { ACHIEVEMENT_DEFINITIONS } from '@/lib/achievements';
import {
  FIELD_LABEL,
  MECHANIC_META,
  QUEST_DEFAULT_SORT,
  QUEST_STATUSES,
  deriveQuestStatus,
  normalizeCadence,
  questCrossRules,
  type QuestActionInput,
  type QuestActionResult,
  type QuestAuditRow,
  type QuestCadence,
  type QuestCreateInput,
  type QuestDetail,
  type QuestListItem,
  type QuestListPage,
  type QuestListQuery,
  type QuestMetrics,
  type QuestOptions,
  type QuestStats,
  type QuestStatus,
  type QuestUpdateInput,
  type QuestWarningCode,
} from './contract';
import type { z } from 'zod';

const DAY = 86_400_000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
/** Görev ödemelerinin defter kaynakları (hepsinde sourceId = UserQuest.id). */
const QUEST_LEDGER_SOURCES = ['quest', 'achievement', 'visit_mission'] as const;
const ACHIEVEMENT_SET: ReadonlySet<string> = new Set(ACHIEVEMENT_QUEST_IDS);

export interface AdminActor {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

type Db = typeof prisma;
type Tx = Prisma.TransactionClient;

// ───────────────────────────── Yardımcılar ─────────────────────────────

export function statusWhere(status: QuestStatus | 'all', now: Date = new Date()): Prisma.QuestWhereInput {
  const notExpired: Prisma.QuestWhereInput = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  switch (status) {
    case 'active':
      return { archivedAt: null, isActive: true, ...notExpired };
    case 'paused':
      return { archivedAt: null, isActive: false, ...notExpired };
    case 'expired':
      return { archivedAt: null, expiresAt: { lte: now } };
    case 'archived':
      return { archivedAt: { not: null } };
    default:
      return {};
  }
}

/** Mekanik süzgeci (requirement Json yolu + sabit başarım kimlikleri). */
export function mechanicWhere(mechanic: QuestListQuery['mechanic']): Prisma.QuestWhereInput {
  if (!mechanic) return {};
  if (mechanic === 'achievement') return { id: { in: [...ACHIEVEMENT_QUEST_IDS] } };
  const notAch: Prisma.QuestWhereInput = { id: { notIn: [...ACHIEVEMENT_QUEST_IDS] } };
  if (mechanic === 'custom') {
    // Motorun tanımadığı her değer (custom, boş, eski) "custom" sayılır.
    const known = ['give_feedback', 'feedback_with_photo', 'detailed_feedback', 'visit_businesses', 'referral', 'visit_category'];
    return { AND: [notAch, ...known.map((k) => ({ NOT: { requirement: { path: ['type'], equals: k } } }))] };
  }
  return { AND: [notAch, { requirement: { path: ['type'], equals: mechanic } }] };
}

export function cadenceWhere(cadence: QuestCadence | undefined): Prisma.QuestWhereInput {
  if (!cadence) return {};
  if (cadence === 'special') {
    return { NOT: { type: { in: ['daily', 'weekly', 'monthly', 'DAILY', 'WEEKLY', 'MONTHLY'] } } };
  }
  return { type: { in: [cadence, cadence.toUpperCase()] } };
}

export function questWhere(f: Pick<QuestListQuery, 'q' | 'status' | 'mechanic' | 'cadence'>, now: Date = new Date()): Prisma.QuestWhereInput {
  const and: Prisma.QuestWhereInput[] = [statusWhere(f.status, now), mechanicWhere(f.mechanic), cadenceWhere(f.cadence)];
  if (f.q) {
    and.push({
      OR: [
        { name: { contains: f.q, mode: 'insensitive' } },
        { description: { contains: f.q, mode: 'insensitive' } },
        { id: f.q },
      ],
    });
  }
  return { AND: and.filter((w) => Object.keys(w).length > 0) };
}

export function questOrderBy(sort: string | undefined): Prisma.QuestOrderByWithRelationInput[] {
  const [id, dir] = (sort ?? QUEST_DEFAULT_SORT).split('.') as [string, string];
  const d: Prisma.SortOrder = dir === 'asc' ? 'asc' : 'desc';
  const primary: Prisma.QuestOrderByWithRelationInput =
    id === 'name' ? { name: d } : id === 'expiresAt' ? { expiresAt: { sort: d, nulls: 'last' } } : id === 'updatedAt' ? { updatedAt: d } : { createdAt: d };
  return [primary, { id: 'asc' }];
}

type QuestRow = {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: string;
  requirement: Prisma.JsonValue;
  reward: Prisma.JsonValue;
  isActive: boolean;
  expiresAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const QUEST_SELECT = {
  id: true,
  name: true,
  description: true,
  icon: true,
  type: true,
  requirement: true,
  reward: true,
  isActive: true,
  expiresAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.QuestSelect;

const EMPTY_METRICS: QuestMetrics = {
  participants: 0,
  completed: 0,
  rewardedUsers: 0,
  payouts30d: 0,
  points30d: 0,
  xp30d: 0,
  lastPayoutAt: null,
};

/** Dealer kategorisi → işletme sayısı (görev hedeflemesi ön kontrolü). */
export async function loadDealerCategories(db: Db = prisma): Promise<Map<string, number>> {
  const rows = await db.user.groupBy({
    by: ['businessCategory'],
    where: { role: 'DEALER', businessCategory: { not: null } },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) if (r.businessCategory) map.set(r.businessCategory, r._count._all);
  return map;
}

export function questWarnings(
  item: Pick<QuestListItem, 'status' | 'mechanic' | 'rawMechanic' | 'category' | 'expiresAt' | 'isAchievement'>,
  categoryDealers: number | null,
  now: Date = new Date()
): QuestWarningCode[] {
  const out: QuestWarningCode[] = [];
  if (item.mechanic === 'custom' && !item.isAchievement) {
    if (item.rawMechanic && item.rawMechanic !== 'custom') out.push('unknown_mechanic');
    else out.push('manual_only');
  }
  if (item.mechanic === 'visit_category' && item.category && (categoryDealers ?? 0) === 0) out.push('category_no_match');
  if (item.status === 'active' && item.expiresAt) {
    const left = new Date(item.expiresAt).getTime() - now.getTime();
    if (left > 0 && left < 3 * DAY) out.push('expiring_soon');
  }
  return out;
}

export function toListItem(row: QuestRow, metrics: QuestMetrics, categories: Map<string, number>, matrix: PointsMatrix, now: Date = new Date()): QuestListItem {
  const req = parseRequirement(row.requirement);
  const mechanic: QuestMechanic = resolveMechanic(row);
  const isAchievement = ACHIEVEMENT_SET.has(row.id);
  const reward = getQuestReward(row.reward, matrix);
  const status = deriveQuestStatus(row, now);
  const category = mechanic === 'visit_category' ? req.category ?? null : null;
  const categoryDealers = category ? categories.get(category) ?? 0 : null;
  const base = {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    cadence: normalizeCadence(row.type),
    rawType: row.type,
    mechanic,
    rawMechanic: req.type,
    tracking: mechanicTracking(mechanic),
    autoReward: MECHANIC_META[mechanic].autoReward,
    target: req.count,
    category,
    minLength: mechanic === 'detailed_feedback' ? req.minLength : null,
    reward,
    status,
    isActive: row.isActive,
    expiresAt: iso(row.expiresAt),
    archivedAt: iso(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isAchievement,
    categoryDealers,
    metrics,
  };
  return { ...base, warnings: questWarnings(base, categoryDealers, now) };
}

type LedgerAgg = { questId: string; payouts: number; points: number; xp: number; lastAt: Date | null };

/** Görev başına metrikler: UserQuest (katılım/tamamlama/ödül) + defter (son 30 gün). */
export async function loadQuestMetrics(ids: string[], now: Date = new Date(), db: Db = prisma): Promise<Map<string, QuestMetrics>> {
  const out = new Map<string, QuestMetrics>();
  if (ids.length === 0) return out;
  const since = new Date(now.getTime() - 30 * DAY);
  const [all, completed, rewarded, ledger] = await Promise.all([
    db.userQuest.groupBy({ by: ['questId'], where: { questId: { in: ids } }, _count: { _all: true } }),
    db.userQuest.groupBy({ by: ['questId'], where: { questId: { in: ids }, completedAt: { not: null } }, _count: { _all: true } }),
    db.userQuest.groupBy({ by: ['questId'], where: { questId: { in: ids }, rewardedAt: { not: null } }, _count: { _all: true } }),
    db.$queryRaw<LedgerAgg[]>(Prisma.sql`
      SELECT uq."questId" AS "questId",
             COUNT(*)::int AS "payouts",
             COALESCE(SUM(pl."delta"), 0)::int AS "points",
             COALESCE(SUM(pl."xpDelta"), 0)::int AS "xp",
             MAX(pl."createdAt") AS "lastAt"
        FROM "PointsLedger" pl
        JOIN "UserQuest" uq ON uq."id" = pl."sourceId"
       WHERE pl."source" IN (${Prisma.join([...QUEST_LEDGER_SOURCES])})
         AND pl."status" = 'posted'
         AND pl."createdAt" >= ${since}
         AND uq."questId" IN (${Prisma.join(ids)})
       GROUP BY uq."questId"`),
  ]);
  for (const id of ids) out.set(id, { ...EMPTY_METRICS });
  for (const r of all) out.get(r.questId)!.participants = r._count._all;
  for (const r of completed) out.get(r.questId)!.completed = r._count._all;
  for (const r of rewarded) out.get(r.questId)!.rewardedUsers = r._count._all;
  for (const r of ledger) {
    const m = out.get(r.questId);
    if (!m) continue;
    m.payouts30d = Number(r.payouts) || 0;
    m.points30d = Number(r.points) || 0;
    m.xp30d = Number(r.xp) || 0;
    m.lastPayoutAt = r.lastAt ? new Date(r.lastAt).toISOString() : null;
  }
  return out;
}

const rewardDefaultOf = (m: PointsMatrix) => ({ points: m.quest.default.points, xp: m.quest.default.xp });

async function statusCounts(base: Prisma.QuestWhereInput, now: Date, db: Db = prisma): Promise<Record<QuestStatus, number>> {
  const counts = await Promise.all(
    QUEST_STATUSES.map((s) => db.quest.count({ where: { AND: [base, statusWhere(s, now)] } }))
  );
  return Object.fromEntries(QUEST_STATUSES.map((s, i) => [s, counts[i]])) as Record<QuestStatus, number>;
}

// ───────────────────────────── Liste ─────────────────────────────

export async function listQuests(query: QuestListQuery, now: Date = new Date(), db: Db = prisma): Promise<QuestListPage> {
  const where = questWhere(query, now);
  const countBase = questWhere({ ...query, status: 'all' }, now);
  const [total, rows, counts, categories, def] = await Promise.all([
    db.quest.count({ where }),
    db.quest.findMany({
      where,
      select: QUEST_SELECT,
      orderBy: questOrderBy(query.sort),
      skip: (query.page - 1) * query.size,
      take: query.size,
    }),
    statusCounts(countBase, now, db),
    loadDealerCategories(db),
    getPointsMatrix(),
  ]);
  const metrics = await loadQuestMetrics(rows.map((r) => r.id), now, db);
  return {
    items: rows.map((r) => toListItem(r, metrics.get(r.id) ?? EMPTY_METRICS, categories, def, now)),
    total,
    page: query.page,
    size: query.size,
    counts,
    generatedAt: now.toISOString(),
  };
}

// ───────────────────────────── KPI ─────────────────────────────

type TotalsRow = { payouts: number; points: number; xp: number };
type DayRow = { day: string; points: number; payouts: number };

async function ledgerDaily(since: Date, questId: string | null, db: Db = prisma): Promise<DayRow[]> {
  const questFilter = questId ? Prisma.sql`AND uq."questId" = ${questId}` : Prisma.empty;
  return db.$queryRaw<DayRow[]>(Prisma.sql`
    SELECT to_char(date_trunc('day', pl."createdAt" AT TIME ZONE 'Europe/Istanbul'), 'YYYY-MM-DD') AS "day",
           COALESCE(SUM(pl."delta"), 0)::int AS "points",
           COUNT(*)::int AS "payouts"
      FROM "PointsLedger" pl
      JOIN "UserQuest" uq ON uq."id" = pl."sourceId"
     WHERE pl."source" IN (${Prisma.join([...QUEST_LEDGER_SOURCES])})
       AND pl."status" = 'posted'
       AND pl."createdAt" >= ${since}
       ${questFilter}
     GROUP BY 1`);
}

/** Son `days` İstanbul günü için sıfır doldurulmuş seri (eskiden yeniye). */
export function fillDays(rows: DayRow[], key: 'points' | 'payouts', days: number, now: Date): number[] {
  const byDay = new Map(rows.map((r) => [r.day, Number(r[key]) || 0]));
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(byDay.get(istanbulDayKey(new Date(now.getTime() - i * DAY))) ?? 0);
  return out;
}

export async function getQuestStats(now: Date = new Date(), db: Db = prisma): Promise<QuestStats> {
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since7 = new Date(now.getTime() - 7 * DAY);
  const since14 = getQuestPeriod('daily', new Date(now.getTime() - 13 * DAY)).start;
  const totals = (since: Date) =>
    db.$queryRaw<TotalsRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS "payouts", COALESCE(SUM(pl."delta"), 0)::int AS "points", COALESCE(SUM(pl."xpDelta"), 0)::int AS "xp"
        FROM "PointsLedger" pl
        JOIN "UserQuest" uq ON uq."id" = pl."sourceId"
       WHERE pl."source" IN (${Prisma.join([...QUEST_LEDGER_SOURCES])})
         AND pl."status" = 'posted'
         AND pl."createdAt" >= ${since}`);
  const [counts, t7, t30, daily, activeRows, categories, controls, def, existingAch] = await Promise.all([
    statusCounts({}, now, db),
    totals(since7),
    totals(since30),
    ledgerDaily(since14, null, db),
    db.quest.findMany({ where: statusWhere('active', now), select: QUEST_SELECT, take: 1000 }),
    loadDealerCategories(db),
    getModuleControls(),
    getPointsMatrix(),
    db.quest.count({ where: { id: { in: ACHIEVEMENT_DEFINITIONS.map((a) => a.id) } } }),
  ]);
  const needsAttention = activeRows
    .map((r) => toListItem(r, EMPTY_METRICS, categories, def, now))
    .filter((q) => q.warnings.some((w) => w !== 'expiring_soon' && w !== 'manual_only')).length;
  const pick = (r: TotalsRow[] | undefined) => ({ payouts: Number(r?.[0]?.payouts) || 0, points: Number(r?.[0]?.points) || 0, xp: Number(r?.[0]?.xp) || 0 });
  return {
    counts: { ...counts, all: QUEST_STATUSES.reduce((s, k) => s + counts[k], 0) },
    rewards7d: pick(t7),
    rewards30d: pick(t30),
    dailyPoints14d: fillDays(daily, 'points', 14, now),
    needsAttention,
    moduleEnabled: (controls as Record<string, unknown>).quests !== false,
    rewardDefault: rewardDefaultOf(def),
    missingAchievements: Math.max(0, ACHIEVEMENT_DEFINITIONS.length - existingAch),
    generatedAt: now.toISOString(),
  };
}

export async function getQuestOptions(db: Db = prisma): Promise<QuestOptions> {
  const [categories, def] = await Promise.all([loadDealerCategories(db), getPointsMatrix()]);
  return {
    categories: [...categories.entries()]
      .map(([value, dealers]) => ({ value, dealers }))
      .sort((a, b) => b.dealers - a.dealers || a.value.localeCompare(b.value, 'tr')),
    rewardDefault: rewardDefaultOf(def),
  };
}

// ───────────────────────────── Ayrıntı ─────────────────────────────

const TRACKED_FIELDS = ['name', 'description', 'icon', 'type', 'requirement', 'reward', 'expiresAt', 'isActive', 'archivedAt'] as const;

export function diffFields(oldData: unknown, newData: unknown): string[] {
  if (!oldData || !newData || typeof oldData !== 'object' || typeof newData !== 'object') return [];
  const o = oldData as Record<string, unknown>;
  const n = newData as Record<string, unknown>;
  return TRACKED_FIELDS.filter((k) => k in n && JSON.stringify(o[k] ?? null) !== JSON.stringify(n[k] ?? null)).map((k) => FIELD_LABEL[k] ?? k);
}

export async function getQuestDetail(id: string, now: Date = new Date(), db: Db = prisma): Promise<QuestDetail> {
  const row = await db.quest.findUnique({ where: { id }, select: QUEST_SELECT });
  if (!row) throw new ApiError('NOT_FOUND', 'Görev bulunamadı.');
  const since14 = getQuestPeriod('daily', new Date(now.getTime() - 13 * DAY)).start;
  const [metrics, categories, def, recent, audit, daily] = await Promise.all([
    loadQuestMetrics([id], now, db),
    loadDealerCategories(db),
    getPointsMatrix(),
    db.userQuest.findMany({
      where: { questId: id, completedAt: { not: null } },
      orderBy: [{ completedAt: 'desc' }, { id: 'asc' }],
      take: 10,
      select: { userId: true, progress: true, completedAt: true, rewardedAt: true, user: { select: { name: true, email: true } } },
    }),
    db.auditLog.findMany({
      where: { entity: 'Quest', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true, action: true, createdAt: true, oldData: true, newData: true, user: { select: { name: true, email: true } } },
    }),
    ledgerDaily(since14, id, db),
  ]);
  const auditRows: QuestAuditRow[] = audit.map((a) => {
    const nd = (a.newData && typeof a.newData === 'object' ? a.newData : {}) as Record<string, unknown>;
    return {
      id: a.id,
      action: a.action,
      at: a.createdAt.toISOString(),
      actorName: a.user?.name || a.user?.email || null,
      reason: typeof nd.reason === 'string' ? nd.reason : null,
      changes: a.action === 'UPDATE_QUEST' ? diffFields(a.oldData, a.newData) : [],
    };
  });
  return {
    quest: toListItem(row, metrics.get(id) ?? EMPTY_METRICS, categories, def, now),
    recent: recent.map((r) => ({
      userId: r.userId,
      name: r.user?.name ?? null,
      email: r.user?.email ?? null,
      progress: r.progress,
      completedAt: iso(r.completedAt),
      rewardedAt: iso(r.rewardedAt),
    })),
    audit: auditRows,
    dailyPayouts14d: fillDays(daily, 'payouts', 14, now),
  };
}

// ───────────────────────────── Yazma ─────────────────────────────

function snapshot(q: QuestRow): Prisma.InputJsonObject {
  return {
    name: q.name,
    description: q.description,
    icon: q.icon,
    type: q.type,
    requirement: (q.requirement ?? null) as Prisma.InputJsonValue,
    reward: (q.reward ?? null) as Prisma.InputJsonValue,
    expiresAt: iso(q.expiresAt),
    isActive: q.isActive,
    archivedAt: iso(q.archivedAt),
  } as Prisma.InputJsonObject;
}

async function audit(tx: Tx, actor: AdminActor, action: string, entityId: string, newData: Prisma.InputJsonObject, oldData?: Prisma.InputJsonObject) {
  await tx.auditLog.create({
    data: {
      userId: actor.userId,
      actorType: 'user',
      action,
      entity: 'Quest',
      entityId,
      ...(oldData ? { oldData } : {}),
      newData,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    },
  });
}

function buildRequirement(mechanic: string, target: number, category: string | null | undefined, minLength: number | null | undefined): Prisma.InputJsonObject {
  return {
    type: mechanic,
    count: target,
    ...(mechanic === 'visit_category' && category ? { category } : {}),
    ...(mechanic === 'detailed_feedback' && minLength ? { minLength } : {}),
  };
}

function assertExpiryInFuture(expiresAt: string | null | undefined, now: Date) {
  if (expiresAt && new Date(expiresAt).getTime() <= now.getTime() + 5 * 60_000) {
    throw new ApiError('VALIDATION', 'Bitiş anı en az 5 dakika sonrası olmalı.', { details: [{ path: 'expiresWall', message: 'Bitiş anı en az 5 dakika sonrası olmalı.' }] });
  }
}

async function assertCategoryExists(category: string | null | undefined, db: Db | Tx) {
  if (!category) return;
  const n = await db.user.count({ where: { role: 'DEALER', businessCategory: category } });
  if (n === 0) {
    throw new ApiError('VALIDATION', `“${category}” kategorisinde işletme yok; görev tamamlanamaz.`, {
      details: [{ path: 'category', message: 'Bu kategoride kayıtlı işletme yok.' }],
    });
  }
}

export async function createQuest(input: QuestCreateInput, actor: AdminActor, now: Date = new Date(), db: Db = prisma): Promise<{ id: string; status: QuestStatus }> {
  assertExpiryInFuture(input.expiresAt, now);
  if (input.mechanic === 'visit_category') await assertCategoryExists(input.category, db);
  return db.$transaction(async (tx) => {
    const q = await tx.quest.create({
      data: {
        name: input.name,
        description: input.description,
        icon: input.icon,
        type: input.cadence,
        requirement: buildRequirement(input.mechanic, input.target, input.category, input.minLength),
        reward: { points: input.points, xp: input.xp },
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        isActive: input.publish,
      },
      select: QUEST_SELECT,
    });
    await audit(tx, actor, 'CREATE_QUEST', q.id, { ...snapshot(q), published: input.publish });
    return { id: q.id, status: deriveQuestStatus(q, now) };
  });
}

/** Katılımı olan görevde kilitli alanlar (ilerlemenin anlamı değişir → kopyalayın). */
const LOCKED_WHEN_USED = ['mechanic', 'cadence', 'category', 'minLength'] as const;

export async function updateQuest(id: string, input: QuestUpdateInput, actor: AdminActor, now: Date = new Date(), db: Db = prisma): Promise<{ id: string; status: QuestStatus; updatedAt: string }> {
  return db.$transaction(async (tx) => {
    const cur = await tx.quest.findUnique({ where: { id }, select: QUEST_SELECT });
    if (!cur) throw new ApiError('NOT_FOUND', 'Görev bulunamadı.');
    if (cur.updatedAt.toISOString() !== new Date(input.baseUpdatedAt).toISOString()) {
      throw new ApiError('VERSION_CONFLICT', 'Görev siz düzenlerken başka biri tarafından değiştirildi. Güncel hâlini yükleyip tekrar deneyin.', { status: 409 });
    }
    if (cur.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki görev düzenlenemez; önce arşivden çıkarın.');

    const req = parseRequirement(cur.requirement);
    const curMechanic = resolveMechanic(cur);
    const isAch = ACHIEVEMENT_SET.has(id);
    const curReward = getQuestReward(cur.reward, await getPointsMatrix());

    const next = {
      mechanic: (input.mechanic ?? curMechanic) as QuestMechanic,
      cadence: input.cadence ?? normalizeCadence(cur.type),
      target: input.target ?? req.count,
      category: input.category !== undefined ? input.category : req.category ?? null,
      minLength: input.minLength !== undefined ? input.minLength : curMechanic === 'detailed_feedback' ? req.minLength : null,
      points: input.points ?? curReward.points,
      xp: input.xp ?? curReward.xp,
    };

    const before = {
      mechanic: curMechanic as string,
      cadence: normalizeCadence(cur.type) as string,
      target: req.count,
      category: req.category ?? null,
      minLength: curMechanic === 'detailed_feedback' ? req.minLength : null,
    };
    const changed = (k: keyof typeof before) => input[k] !== undefined && JSON.stringify(input[k] ?? null) !== JSON.stringify(before[k] ?? null);

    if (isAch) {
      if ((['mechanic', 'cadence', 'target', 'category', 'minLength'] as const).some(changed)) {
        throw new ApiError('VALIDATION', 'Başarım görevlerinde mekanik, dönem ve hedef sistem tarafından belirlenir; yalnız metin, simge, ödül ve bitiş değiştirilebilir.');
      }
    } else {
      const changedLocked = LOCKED_WHEN_USED.filter(changed);
      if (changedLocked.length) {
        const used = await tx.userQuest.count({ where: { questId: id } });
        if (used > 0) {
          throw new ApiError('QUEST_LOCKED', `Bu görevde ${used} kullanıcının ilerlemesi var; mekanik, dönem ve kategori değiştirilemez. Görevi kopyalayıp yeni sürümü yayınlayın.`, { status: 409 });
        }
      }
      const issues: Array<{ path: (string | number)[]; message: string }> = [];
      questCrossRules(next, { addIssue: (i: { path?: (string | number)[]; message?: string }) => issues.push({ path: i.path ?? [], message: i.message ?? 'Geçersiz' }), path: [] } as unknown as z.RefinementCtx);
      if (issues.length) {
        throw new ApiError('VALIDATION', issues[0].message, { details: issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
      }
      if (next.mechanic === 'visit_category' && (changed('mechanic') || changed('category'))) {
        await assertCategoryExists(next.category, tx);
      }
    }
    if (isAch && (input.points !== undefined || input.xp !== undefined) && next.points === 0 && next.xp === 0) {
      throw new ApiError('VALIDATION', 'Ödülsüz görev olmaz: puan ya da XP girin.', { details: [{ path: 'points', message: 'Ödülsüz görev olmaz: puan ya da XP girin.' }] });
    }
    if (input.expiresAt !== undefined) assertExpiryInFuture(input.expiresAt, now);

    const data: Prisma.QuestUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.icon !== undefined) data.icon = input.icon;
    if (!isAch && input.cadence !== undefined) data.type = input.cadence;
    if (input.points !== undefined || input.xp !== undefined) data.reward = { points: next.points, xp: next.xp };
    if (!isAch && (input.mechanic !== undefined || input.target !== undefined || input.category !== undefined || input.minLength !== undefined)) {
      data.requirement = buildRequirement(next.mechanic, next.target, next.category, next.minLength);
    }
    if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    // Koşullu yazım: okuma ile yazma arasında başka biri kaydettiyse 409.
    const res = await tx.quest.updateMany({ where: { id, updatedAt: cur.updatedAt }, data: data as Prisma.QuestUpdateManyMutationInput });
    if (res.count === 0) throw new ApiError('VERSION_CONFLICT', 'Görev siz düzenlerken değişti. Güncel hâlini yükleyin.', { status: 409 });
    const after = await tx.quest.findUniqueOrThrow({ where: { id }, select: QUEST_SELECT });
    await audit(tx, actor, 'UPDATE_QUEST', id, snapshot(after), snapshot(cur));
    return { id, status: deriveQuestStatus(after, now), updatedAt: after.updatedAt.toISOString() };
  });
}

// ───────────────────────────── Durum geçişleri ─────────────────────────────

export async function applyQuestAction(id: string, input: QuestActionInput, actor: AdminActor, now: Date = new Date(), db: Db = prisma): Promise<QuestActionResult> {
  if (input.action === 'manual_complete') return manualComplete(id, input, actor, now, db);
  return db.$transaction(async (tx) => {
    const cur = await tx.quest.findUnique({ where: { id }, select: QUEST_SELECT });
    if (!cur) throw new ApiError('NOT_FOUND', 'Görev bulunamadı.');
    const notExpired: Prisma.QuestWhereInput = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };

    switch (input.action) {
      case 'pause': {
        const r = await tx.quest.updateMany({ where: { id, isActive: true, archivedAt: null }, data: { isActive: false } });
        if (r.count === 0) throw new ApiError('CONFLICT', 'Görev zaten yayında değil.');
        await audit(tx, actor, 'QUEST_PAUSE', id, { isActive: false, ...(input.reason ? { reason: input.reason } : {}) }, { isActive: true });
        return { id, status: deriveQuestStatus({ ...cur, isActive: false }, now), message: 'Görev duraklatıldı; müşterilere artık görünmez, ilerlemeler korunur.' };
      }
      case 'resume': {
        if (cur.expiresAt && cur.expiresAt.getTime() <= now.getTime()) {
          throw new ApiError('CONFLICT', 'Süresi dolmuş görev yayına alınamaz. Önce bitiş tarihini ileri alın.');
        }
        const r = await tx.quest.updateMany({ where: { id, isActive: false, archivedAt: null, ...notExpired }, data: { isActive: true } });
        if (r.count === 0) throw new ApiError('CONFLICT', cur.archivedAt ? 'Arşivdeki görev önce arşivden çıkarılmalı.' : 'Görev zaten yayında.');
        await audit(tx, actor, 'QUEST_RESUME', id, { isActive: true }, { isActive: false });
        return { id, status: 'active', message: 'Görev yayında.' };
      }
      case 'archive': {
        const r = await tx.quest.updateMany({ where: { id, archivedAt: null }, data: { isActive: false, archivedAt: now } });
        if (r.count === 0) throw new ApiError('CONFLICT', 'Görev zaten arşivde.');
        await audit(tx, actor, 'QUEST_ARCHIVE', id, { archivedAt: now.toISOString(), reason: input.reason }, { isActive: cur.isActive, archivedAt: null });
        return { id, status: 'archived', message: 'Görev arşivlendi. Kullanıcı ilerlemeleri ve ödeme kayıtları korunur.' };
      }
      case 'restore': {
        const r = await tx.quest.updateMany({ where: { id, archivedAt: { not: null } }, data: { archivedAt: null, isActive: false } });
        if (r.count === 0) throw new ApiError('CONFLICT', 'Görev arşivde değil.');
        await audit(tx, actor, 'QUEST_RESTORE', id, { archivedAt: null, isActive: false }, { archivedAt: iso(cur.archivedAt) });
        return { id, status: deriveQuestStatus({ ...cur, archivedAt: null, isActive: false }, now), message: 'Görev arşivden çıkarıldı ve duraklatılmış olarak bekliyor.' };
      }
      case 'duplicate': {
        if (ACHIEVEMENT_SET.has(id)) throw new ApiError('BAD_REQUEST', 'Başarım görevleri sistem kimliğine bağlıdır; kopyalanamaz.');
        const suffix = ' (kopya)';
        const name = cur.name.length + suffix.length > 50 ? `${cur.name.slice(0, 50 - suffix.length)}${suffix}` : `${cur.name}${suffix}`;
        const copy = await tx.quest.create({
          data: {
            name,
            description: cur.description,
            icon: cur.icon,
            type: normalizeCadence(cur.type),
            requirement: (cur.requirement ?? {}) as Prisma.InputJsonValue,
            reward: (cur.reward ?? {}) as Prisma.InputJsonValue,
            // Bitmiş bitiş tarihi kopyalanmaz (yeni görev hemen "süresi doldu" olmasın).
            expiresAt: cur.expiresAt && cur.expiresAt.getTime() > now.getTime() ? cur.expiresAt : null,
            isActive: false,
          },
          select: QUEST_SELECT,
        });
        await audit(tx, actor, 'QUEST_DUPLICATE', id, { copyId: copy.id });
        await audit(tx, actor, 'QUEST_DUPLICATED_FROM', copy.id, { ...snapshot(copy), sourceId: id });
        return { id, status: deriveQuestStatus(cur, now), createdId: copy.id, message: 'Kopya duraklatılmış olarak oluşturuldu; düzenleyip yayına alın.' };
      }
    }
  });
}

async function manualComplete(
  id: string,
  input: Extract<QuestActionInput, { action: 'manual_complete' }>,
  actor: AdminActor,
  now: Date,
  db: Db
): Promise<QuestActionResult> {
  const quest = await db.quest.findUnique({ where: { id }, select: QUEST_SELECT });
  if (!quest) throw new ApiError('NOT_FOUND', 'Görev bulunamadı.');
  const mechanic = resolveMechanic(quest);
  if (mechanic !== 'custom' || ACHIEVEMENT_SET.has(id)) {
    throw new ApiError('BAD_REQUEST', 'Elle tamamlama yalnız “Yönetici onaylı” görevlerde yapılır; diğer görevler kendi motoruyla ilerler.');
  }
  const status = deriveQuestStatus(quest, now);
  if (status !== 'active') throw new ApiError('CONFLICT', 'Yalnız yayındaki görevde kullanıcı tamamlandı işaretlenebilir.');

  const key = input.user.trim();
  const user = await db.user.findFirst({
    where: key.includes('@') ? { email: { equals: key, mode: 'insensitive' } } : { id: key },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) throw new ApiError('VALIDATION', 'Kullanıcı bulunamadı.', { details: [{ path: 'user', message: 'Bu e-posta ya da kimlikle kullanıcı yok.' }] });
  if (user.role !== 'CUSTOMER') throw new ApiError('VALIDATION', 'Görevler yalnız müşteri hesaplarına işlenir.', { details: [{ path: 'user', message: 'Bu hesap müşteri değil.' }] });

  const { count: target } = parseRequirement(quest.requirement);
  const period = getQuestPeriod(questPeriodKind(quest.type), now);

  return db.$transaction(async (tx) => {
    const row = await tx.userQuest.findUnique({
      where: { userId_questId: { userId: user.id, questId: id } },
      select: { id: true, progress: true, completedAt: true, rewardedAt: true },
    });
    if (row) {
      if (rewardedInPeriod(row.rewardedAt, period)) throw new ApiError('CONFLICT', 'Kullanıcı bu dönemin ödülünü zaten aldı.');
      if (storedCompletionInPeriod(row, period, target)) throw new ApiError('CONFLICT', 'Kullanıcı bu dönem için zaten tamamlandı işaretli; ödülünü alması bekleniyor.');
      // Koşullu yazım: eşzamanlı ikinci işaretleme no-op olur.
      const r = await tx.userQuest.updateMany({ where: { id: row.id, completedAt: row.completedAt }, data: { progress: target, completedAt: now } });
      if (r.count === 0) throw new ApiError('CONFLICT', 'Kayıt bu sırada değişti; tekrar deneyin.');
    } else {
      await tx.userQuest.create({ data: { userId: user.id, questId: id, progress: target, completedAt: now } });
    }
    await tx.notification.create({
      data: {
        userId: user.id,
        title: 'Görev tamamlandı',
        message: `${quest.name} görevin onaylandı. Ödülünü Görevler sayfasından alabilirsin.`,
        type: 'success',
        data: { questId: id, href: '/customer/quests' },
      },
    });
    await audit(tx, actor, 'QUEST_MANUAL_COMPLETE', id, { reason: input.reason, targetUserId: user.id, period: period.key });
    return { id, status, message: `${user.name || user.email || 'Kullanıcı'} için görev tamamlandı işaretlendi; ödül müşteri “Al” dediğinde işlenir.` };
  });
}

// ───────────────────────────── Başarımlar ─────────────────────────────

/** Eksik sistem başarımlarını DURAKLATILMIŞ olarak oluşturur; var olanlara dokunmaz. */
export async function addMissingAchievements(actor: AdminActor, db: Db = prisma): Promise<{ created: number; ids: string[] }> {
  return db.$transaction(async (tx) => {
    const existing = await tx.quest.findMany({ where: { id: { in: ACHIEVEMENT_DEFINITIONS.map((a) => a.id) } }, select: { id: true } });
    const have = new Set(existing.map((e) => e.id));
    const missing = ACHIEVEMENT_DEFINITIONS.filter((a) => !have.has(a.id));
    if (missing.length === 0) return { created: 0, ids: [] };
    await tx.quest.createMany({
      data: missing.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        icon: a.icon,
        type: 'special',
        requirement: { ...a.requirement },
        reward: { ...a.reward },
        isActive: false,
      })),
      skipDuplicates: true,
    });
    for (const a of missing) await audit(tx, actor, 'BULK_CREATE_QUEST', a.id, { source: 'achievements', name: a.name });
    return { created: missing.length, ids: missing.map((a) => a.id) };
  });
}
