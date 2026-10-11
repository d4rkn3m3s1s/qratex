/**
 * Kampanya Takvimi — sunucu veri katmanı. Sayfa (sunucu ön yükleme) ve BFF uçları aynı
 * fonksiyonları çağırır. Hata YUTULMAZ: uçlar defineRoute'un merkezi catch'ine, sayfa
 * `settle` ile görünür hataya çevirir.
 *
 * Arşiv: şemada `archivedAt` alanı olmadığından (ŞEMA İSTEĞİ) arşiv kaydı
 * Settings['campaignsCalendarArchive'] içinde tutulur ve arşivlenen kayıt `isActive=false`
 * yapılır — seçiciler (puan + görünüm) onu hiç uygulamaz. Kayıt silinmez (cascade yok).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { lockResource, versionFromContent } from '@/lib/settings-version';
import { getSeasonalCampaignSpent } from '@/lib/seasonal-campaign-live';
import { syncActiveSeasonalConcept } from '@/lib/seasonal-concept-core';
import { istanbulDay, istanbulDayStart } from '@/components/ds/page/date-range';
import {
  CAMPAIGN_CAPS,
  EMPTY_ARCHIVE,
  FIELD_LABEL,
  HISTORY_LABEL,
  campaignInputSchema,
  campaignVersionPayload,
  conceptInputSchema,
  detectConflicts,
  estimateCampaignExtra,
  parseArchiveMap,
  toCampaignView,
  toConceptView,
  withCampaignStatus,
  withConceptStatus,
  campaignWinnerAt,
  type ArchiveMap,
  type CalendarData,
  type CampaignDetail,
  type CampaignInput,
  type CampaignView,
  type ConceptDetail,
  type ConceptInput,
  type ConceptView,
  type HistoryEntry,
  type ListFilter,
  type ListPage,
  type PreviewResult,
  type RawCampaign,
  type RawConcept,
} from './contract';

type Tx = Prisma.TransactionClient;
type AuditMeta = { ipAddress: string | null; userAgent: string | null };
type Actor = { id: string; meta: AuditMeta };

export const ARCHIVE_KEY = 'campaignsCalendarArchive';
const DAY = 86_400_000;

const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  description: true,
  type: true,
  multiplier: true,
  bonusPoints: true,
  imageUrl: true,
  conditions: true,
  challengeType: true,
  challengeGoal: true,
  challengeRewardPoints: true,
  challengeRewardBadgeId: true,
  isActive: true,
  startDate: true,
  endDate: true,
  createdAt: true,
} as const;

// ───────────────────────────── Arşiv ─────────────────────────────

export async function readArchive(db: Tx | typeof prisma = prisma): Promise<ArchiveMap> {
  const row = await db.settings.findUnique({ where: { key: ARCHIVE_KEY }, select: { value: true } });
  return row ? parseArchiveMap(row.value) : { campaigns: {}, concepts: {} };
}

async function writeArchive(tx: Tx, map: ArchiveMap): Promise<void> {
  await tx.settings.upsert({
    where: { key: ARCHIVE_KEY },
    create: { key: ARCHIVE_KEY, category: 'seasonal', value: map as unknown as Prisma.InputJsonObject },
    update: { value: map as unknown as Prisma.InputJsonObject },
  });
}

// ───────────────────────────── Dönüştürücüler ─────────────────────────────

export function campaignVersion(c: RawCampaign): string {
  return versionFromContent(campaignVersionPayload(c));
}

function campaignBase(c: RawCampaign, archive: ArchiveMap, spent: number | null = null) {
  return toCampaignView(c, campaignVersion(c), archive.campaigns[c.id] ?? null, spent);
}

async function budgetSpentFor(rows: RawCampaign[], now: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const budgeted = rows.filter((r) => {
    const b = r.conditions && typeof r.conditions === 'object' ? (r.conditions as Record<string, unknown>).budgetPoints : null;
    return typeof b === 'number' && r.startDate.getTime() <= now.getTime();
  });
  await Promise.all(
    budgeted.slice(0, 40).map(async (r) => {
      out.set(r.id, await getSeasonalCampaignSpent(r.id, r.startDate));
    })
  );
  return out;
}

function snapshotCampaign(c: RawCampaign): Prisma.InputJsonObject {
  return campaignVersionPayload(c) as Prisma.InputJsonObject;
}

function snapshotConcept(c: RawConcept): Prisma.InputJsonObject {
  return {
    name: c.name,
    description: c.description,
    priority: c.priority,
    backgroundEffect: c.backgroundEffect,
    themePresetId: c.themePresetId,
    bannerText: c.bannerText,
    bannerEmoji: c.bannerEmoji,
    isActive: c.isActive,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
  };
}

function changed(before: Prisma.InputJsonObject, after: Prisma.InputJsonObject): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));
}

// ───────────────────────────── Takvim ─────────────────────────────

export async function loadCalendar(opts: { from?: string; days?: number; now?: Date } = {}): Promise<CalendarData> {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 90;
  const from = opts.from ? new Date(opts.from) : new Date(istanbulDayStart(istanbulDay(now)).getTime() - 14 * DAY);
  const to = new Date(from.getTime() + days * DAY);

  // Pencere + şimdi: canlı durumun doğru hesaplanması için "şu an açık" kayıtlar da yüklenir.
  const windowWhere = {
    OR: [
      { endDate: { gte: from }, startDate: { lte: to } },
      { startDate: { lte: now }, endDate: { gte: now } },
    ],
  };
  const [archive, rawCampaigns, rawConcepts, nextCampaignRow, nextConceptRow, todayPoints] = await Promise.all([
    readArchive(),
    prisma.seasonalCampaign.findMany({ where: windowWhere, select: CAMPAIGN_SELECT, orderBy: { startDate: 'asc' }, take: 300 }),
    prisma.seasonalConcept.findMany({ where: windowWhere, orderBy: { startDate: 'asc' }, take: 300 }),
    prisma.seasonalCampaign.findFirst({
      where: { isActive: true, startDate: { gt: now } },
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true, startDate: true },
    }),
    prisma.seasonalConcept.findFirst({
      where: { isActive: true, startDate: { gt: now } },
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true, startDate: true },
    }),
    campaignPointsSince(istanbulDayStart(istanbulDay(now))),
  ]);

  const spent = await budgetSpentFor(rawCampaigns as RawCampaign[], now);
  const campaignBases = (rawCampaigns as RawCampaign[]).map((c) => campaignBase(c, archive, spent.get(c.id) ?? null));
  const conceptBases = (rawConcepts as RawConcept[]).map((c) => toConceptView(c, archive.concepts[c.id] ?? null));
  const campaigns = withCampaignStatus(campaignBases, now);
  const concepts = withConceptStatus(conceptBases, now);

  const liveC = campaigns.find((c) => c.status === 'live' && !c.targeted) ?? null;
  const liveK = concepts.find((c) => c.status === 'live') ?? null;
  const archivedCampaign = (id: string | undefined) => !!id && !!archive.campaigns[id];
  const archivedConcept = (id: string | undefined) => !!id && !!archive.concepts[id];

  return {
    window: { from: from.toISOString(), to: to.toISOString(), days },
    campaigns,
    concepts,
    conflicts: detectConflicts(campaignBases, conceptBases, now),
    summary: {
      now: now.toISOString(),
      liveCampaign: liveC
        ? { id: liveC.id, name: liveC.name, multiplier: liveC.effectiveMultiplier, bonus: liveC.effectiveBonus, endsAt: liveC.endDate }
        : null,
      targetedLiveCount: campaigns.filter((c) => c.status === 'live' && c.targeted).length,
      liveConcept: liveK ? { id: liveK.id, name: liveK.name, emoji: liveK.bannerEmoji, endsAt: liveK.endDate } : null,
      nextCampaign:
        nextCampaignRow && !archivedCampaign(nextCampaignRow.id)
          ? { id: nextCampaignRow.id, name: nextCampaignRow.name, startsAt: nextCampaignRow.startDate.toISOString() }
          : null,
      nextConcept:
        nextConceptRow && !archivedConcept(nextConceptRow.id)
          ? { id: nextConceptRow.id, name: nextConceptRow.name, startsAt: nextConceptRow.startDate.toISOString() }
          : null,
      campaignPointsToday: todayPoints,
    },
    caps: CAMPAIGN_CAPS,
  };
}

/** Belirli andan beri kampanyalı (meta.seasonalCampaignId dolu) kazanımlarda basılan puan. */
async function campaignPointsSince(since: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ pts: bigint | number | null }>>`
    SELECT COALESCE(SUM("delta"), 0) AS pts
    FROM "PointsLedger"
    WHERE "status" = 'posted' AND "createdAt" >= ${since}
      AND ("meta"->>'seasonalCampaignId') IS NOT NULL`;
  return Number(rows[0]?.pts ?? 0);
}

// ───────────────────────────── Liste ─────────────────────────────

function filterWhere(filter: ListFilter, now: Date, archivedIds: string[]) {
  const notArchived = archivedIds.length ? { id: { notIn: archivedIds } } : {};
  switch (filter) {
    case 'running':
      return { ...notArchived, isActive: true, startDate: { lte: now }, endDate: { gte: now } };
    case 'scheduled':
      return { ...notArchived, isActive: true, startDate: { gt: now } };
    case 'paused':
      return { ...notArchived, isActive: false, endDate: { gte: now } };
    case 'ended':
      return { ...notArchived, endDate: { lt: now } };
    case 'archived':
      return { id: { in: archivedIds } };
    default:
      return notArchived;
  }
}

function orderFor(filter: ListFilter) {
  if (filter === 'running' || filter === 'scheduled') return { startDate: 'asc' as const };
  if (filter === 'ended') return { endDate: 'desc' as const };
  return { startDate: 'desc' as const };
}

export async function listCampaigns(q: { filter: ListFilter; q?: string; page: number; size: number }, now = new Date()): Promise<ListPage<CampaignView>> {
  const archive = await readArchive();
  const where = {
    ...filterWhere(q.filter, now, Object.keys(archive.campaigns)),
    ...(q.q ? { name: { contains: q.q, mode: 'insensitive' as const } } : {}),
  };
  const [total, rows, liveRows] = await Promise.all([
    prisma.seasonalCampaign.count({ where }),
    prisma.seasonalCampaign.findMany({ where, select: CAMPAIGN_SELECT, orderBy: orderFor(q.filter), skip: (q.page - 1) * q.size, take: q.size }),
    prisma.seasonalCampaign.findMany({
      where: { isActive: true, startDate: { lte: now }, endDate: { gte: now } },
      select: CAMPAIGN_SELECT,
      take: 50,
    }),
  ]);
  const all = new Map<string, RawCampaign>();
  for (const r of [...(liveRows as RawCampaign[]), ...(rows as RawCampaign[])]) all.set(r.id, r);
  const spent = await budgetSpentFor([...all.values()], now);
  const views = withCampaignStatus(
    [...all.values()].map((c) => campaignBase(c, archive, spent.get(c.id) ?? null)),
    now
  );
  const byId = new Map(views.map((v) => [v.id, v]));
  return { items: (rows as RawCampaign[]).map((r) => byId.get(r.id)!), total, page: q.page, size: q.size };
}

export async function listConcepts(q: { filter: ListFilter; q?: string; page: number; size: number }, now = new Date()): Promise<ListPage<ConceptView>> {
  const archive = await readArchive();
  const where = {
    ...filterWhere(q.filter, now, Object.keys(archive.concepts)),
    ...(q.q ? { name: { contains: q.q, mode: 'insensitive' as const } } : {}),
  };
  const [total, rows, liveRows] = await Promise.all([
    prisma.seasonalConcept.count({ where }),
    prisma.seasonalConcept.findMany({ where, orderBy: orderFor(q.filter), skip: (q.page - 1) * q.size, take: q.size }),
    prisma.seasonalConcept.findMany({ where: { isActive: true, startDate: { lte: now }, endDate: { gte: now } }, take: 50 }),
  ]);
  const all = new Map<string, RawConcept>();
  for (const r of [...(liveRows as RawConcept[]), ...(rows as RawConcept[])]) all.set(r.id, r);
  const views = withConceptStatus([...all.values()].map((c) => toConceptView(c, archive.concepts[c.id] ?? null)), now);
  const byId = new Map(views.map((v) => [v.id, v]));
  return { items: (rows as RawConcept[]).map((r) => byId.get(r.id)!), total, page: q.page, size: q.size };
}

// ───────────────────────────── Detay ─────────────────────────────

async function history(entity: 'SeasonalCampaign' | 'SeasonalConcept', id: string): Promise<HistoryEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entity, entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: {
      id: true,
      action: true,
      createdAt: true,
      newData: true,
      actorSnapshot: true,
      user: { select: { name: true, email: true } },
    },
  });
  return rows.map((r) => {
    const nd = (r.newData && typeof r.newData === 'object' && !Array.isArray(r.newData) ? r.newData : {}) as Record<string, unknown>;
    const snap = (r.actorSnapshot && typeof r.actorSnapshot === 'object' ? r.actorSnapshot : {}) as Record<string, unknown>;
    const actor = r.user?.name || r.user?.email || (typeof snap.email === 'string' ? snap.email : null);
    const fields = Array.isArray(nd.changedFields) ? (nd.changedFields as unknown[]).filter((f): f is string => typeof f === 'string') : [];
    return {
      id: r.id,
      action: r.action,
      label: HISTORY_LABEL[r.action] ?? r.action,
      at: r.createdAt.toISOString(),
      actor,
      changedFields: fields.map((f) => FIELD_LABEL[f] ?? f),
      reason: typeof nd.reason === 'string' ? nd.reason : null,
    };
  });
}

export async function getCampaignDetail(id: string, now = new Date()): Promise<CampaignDetail> {
  const row = (await prisma.seasonalCampaign.findUnique({ where: { id }, select: CAMPAIGN_SELECT })) as RawCampaign | null;
  if (!row) throw new ApiError('NOT_FOUND', 'Kampanya bulunamadı');
  const archive = await readArchive();
  // Durum için çakışan (şu an açık) kampanyalar da gerekir.
  const peers = (await prisma.seasonalCampaign.findMany({
    where: { id: { not: id }, endDate: { gte: row.startDate }, startDate: { lte: row.endDate } },
    select: CAMPAIGN_SELECT,
    take: 50,
  })) as RawCampaign[];
  const spent = await budgetSpentFor([row, ...peers], now);
  const bases = [row, ...peers].map((c) => campaignBase(c, archive, spent.get(c.id) ?? null));
  const item = withCampaignStatus(bases, now).find((v) => v.id === id)!;

  const until = new Date(row.endDate.getTime() + 3 * DAY);
  const [bySource, usersRow, claims, badge, hist] = await Promise.all([
    prisma.$queryRaw<Array<{ source: string; pts: bigint | number | null; n: bigint | number }>>`
      SELECT "source", COALESCE(SUM("delta"), 0) AS pts, COUNT(*) AS n
      FROM "PointsLedger"
      WHERE "status" = 'posted' AND "createdAt" >= ${row.startDate} AND "createdAt" <= ${until}
        AND ("meta"->>'seasonalCampaignId') = ${id}
      GROUP BY "source"
      ORDER BY 2 DESC`,
    prisma.$queryRaw<Array<{ users: bigint | number }>>`
      SELECT COUNT(DISTINCT "userId") AS users
      FROM "PointsLedger"
      WHERE "status" = 'posted' AND "createdAt" >= ${row.startDate} AND "createdAt" <= ${until}
        AND ("meta"->>'seasonalCampaignId') = ${id}`,
    row.challengeType
      ? prisma.seasonalChallengeClaim.aggregate({ where: { campaignId: id }, _count: { _all: true }, _sum: { points: true } })
      : Promise.resolve(null),
    row.challengeRewardBadgeId
      ? prisma.badge.findUnique({ where: { id: row.challengeRewardBadgeId }, select: { id: true, name: true, icon: true } })
      : Promise.resolve(null),
    history('SeasonalCampaign', id),
  ]);
  const src = bySource.map((r) => ({ source: r.source, points: Number(r.pts ?? 0), events: Number(r.n) }));
  return {
    item,
    impact: {
      points: src.reduce((s, r) => s + r.points, 0),
      events: src.reduce((s, r) => s + r.events, 0),
      users: Number(usersRow[0]?.users ?? 0),
      bySource: src,
      challenge: claims ? { claims: claims._count._all, points: claims._sum.points ?? 0 } : null,
    },
    badge,
    history: hist,
    conflicts: detectConflicts(bases, [], now).filter((c) => c.itemIds.includes(id)),
  };
}

export async function getConceptDetail(id: string, now = new Date()): Promise<ConceptDetail> {
  const row = (await prisma.seasonalConcept.findUnique({ where: { id } })) as RawConcept | null;
  if (!row) throw new ApiError('NOT_FOUND', 'Konsept bulunamadı');
  const archive = await readArchive();
  const [peers, campaigns, hist] = await Promise.all([
    prisma.seasonalConcept.findMany({
      where: { id: { not: id }, endDate: { gte: row.startDate }, startDate: { lte: row.endDate } },
      take: 50,
    }) as Promise<RawConcept[]>,
    prisma.seasonalCampaign.findMany({
      where: { endDate: { gte: row.startDate }, startDate: { lte: row.endDate } },
      select: CAMPAIGN_SELECT,
      take: 50,
    }) as Promise<RawCampaign[]>,
    history('SeasonalConcept', id),
  ]);
  const bases = [row, ...peers].map((c) => toConceptView(c, archive.concepts[c.id] ?? null));
  const item = withConceptStatus(bases, now).find((v) => v.id === id)!;
  const cBases = campaigns.map((c) => campaignBase(c, archive));
  return {
    item,
    history: hist,
    conflicts: detectConflicts(cBases, bases, now).filter((c) => c.itemIds.includes(id)),
  };
}

// ───────────────────────────── Yazım: kampanya ─────────────────────────────

async function assertBadge(tx: Tx, badgeId: string | null) {
  if (!badgeId) return;
  const b = await tx.badge.findUnique({ where: { id: badgeId }, select: { isActive: true, archivedAt: true } });
  if (!b || !b.isActive || b.archivedAt) {
    throw new ApiError('VALIDATION', 'Seçilen rozet yok ya da pasif', {
      details: [{ path: 'challenge.rewardBadgeId', message: 'Seçilen rozet yok ya da pasif' }],
    });
  }
}

function campaignData(d: CampaignInput) {
  const conditions: Record<string, number> = {};
  if (d.minLevel !== null) conditions.minLevel = d.minLevel;
  if (d.budgetPoints !== null) conditions.budgetPoints = d.budgetPoints;
  return {
    name: d.name,
    description: d.description,
    type: d.type,
    multiplier: d.multiplier,
    bonusPoints: d.bonusPoints,
    imageUrl: d.imageUrl,
    conditions: Object.keys(conditions).length ? (conditions as Prisma.InputJsonObject) : Prisma.DbNull,
    challengeType: d.challenge?.type ?? null,
    challengeGoal: d.challenge?.goal ?? null,
    challengeRewardPoints: d.challenge ? d.challenge.rewardPoints : null,
    challengeRewardBadgeId: d.challenge?.rewardBadgeId ?? null,
    isActive: d.isActive,
    startDate: new Date(d.startDate),
    endDate: new Date(d.endDate),
  };
}

function conflictError(): ApiError {
  return new ApiError('CONFLICT', 'Kayıt siz düzenlerken başka biri tarafından değiştirildi. Güncel hâli yükleyip tekrar deneyin.', {
    details: { reason: 'VERSION_CONFLICT' },
  });
}

async function lockedCampaign(tx: Tx, id: string, baseVersion: string | undefined): Promise<RawCampaign> {
  await lockResource(tx, `seasonalCampaign:${id}`);
  const row = (await tx.seasonalCampaign.findUnique({ where: { id }, select: CAMPAIGN_SELECT })) as RawCampaign | null;
  if (!row) throw new ApiError('NOT_FOUND', 'Kampanya bulunamadı');
  if (baseVersion !== undefined && campaignVersion(row) !== baseVersion) throw conflictError();
  return row;
}

export async function createCampaign(raw: unknown, actor: Actor): Promise<{ id: string; version: string }> {
  const d = campaignInputSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    await assertBadge(tx, d.challenge?.rewardBadgeId ?? null);
    const created = (await tx.seasonalCampaign.create({ data: campaignData(d), select: CAMPAIGN_SELECT })) as RawCampaign;
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'CREATE_SEASONAL_CAMPAIGN',
        entity: 'SeasonalCampaign',
        entityId: created.id,
        newData: snapshotCampaign(created),
        ...actor.meta,
      },
    });
    return { id: created.id, version: campaignVersion(created) };
  });
}

export async function updateCampaign(id: string, raw: unknown, baseVersion: string | undefined, actor: Actor) {
  if (!baseVersion) throw new ApiError('BAD_REQUEST', 'Sürüm bilgisi (baseVersion) gerekli');
  const d = campaignInputSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const before = await lockedCampaign(tx, id, baseVersion);
    const archive = await readArchive(tx);
    if (archive.campaigns[id] && d.isActive) {
      throw new ApiError('CONFLICT', 'Arşivdeki kampanya etkinleştirilemez; önce arşivden çıkarın.');
    }
    await assertBadge(tx, d.challenge?.rewardBadgeId ?? null);
    const after = (await tx.seasonalCampaign.update({ where: { id }, data: campaignData(d), select: CAMPAIGN_SELECT })) as RawCampaign;
    const o = snapshotCampaign(before);
    const n = snapshotCampaign(after);
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'UPDATE_SEASONAL_CAMPAIGN',
        entity: 'SeasonalCampaign',
        entityId: id,
        oldData: o,
        newData: { ...n, changedFields: changed(o, n) } as Prisma.InputJsonObject,
        ...actor.meta,
      },
    });
    return { id, version: campaignVersion(after) };
  });
}

export async function setCampaignActive(id: string, isActive: boolean, baseVersion: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const before = await lockedCampaign(tx, id, baseVersion);
    if (isActive && (await readArchive(tx)).campaigns[id]) {
      throw new ApiError('CONFLICT', 'Arşivdeki kampanya etkinleştirilemez; önce arşivden çıkarın.');
    }
    const after = (await tx.seasonalCampaign.update({ where: { id }, data: { isActive }, select: CAMPAIGN_SELECT })) as RawCampaign;
    const o = snapshotCampaign(before);
    const n = snapshotCampaign(after);
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'UPDATE_SEASONAL_CAMPAIGN',
        entity: 'SeasonalCampaign',
        entityId: id,
        oldData: o,
        newData: { ...n, changedFields: changed(o, n) } as Prisma.InputJsonObject,
        ...actor.meta,
      },
    });
    return { id, version: campaignVersion(after) };
  });
}

export async function archiveCampaign(id: string, reason: string, baseVersion: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const before = await lockedCampaign(tx, id, baseVersion);
    await lockResource(tx, ARCHIVE_KEY);
    const archive = await readArchive(tx);
    if (archive.campaigns[id]) throw new ApiError('CONFLICT', 'Kampanya zaten arşivde');
    const after = (await tx.seasonalCampaign.update({ where: { id }, data: { isActive: false }, select: CAMPAIGN_SELECT })) as RawCampaign;
    archive.campaigns[id] = { at: new Date().toISOString(), reason, by: actor.id };
    await writeArchive(tx, archive);
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'SEASONAL_CAMPAIGN_ARCHIVE',
        entity: 'SeasonalCampaign',
        entityId: id,
        oldData: snapshotCampaign(before),
        newData: { ...snapshotCampaign(after), reason, changedFields: before.isActive ? ['isActive'] : [] } as Prisma.InputJsonObject,
        ...actor.meta,
      },
    });
    return { id, version: campaignVersion(after) };
  });
}

export async function restoreCampaign(id: string, baseVersion: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const row = await lockedCampaign(tx, id, baseVersion);
    await lockResource(tx, ARCHIVE_KEY);
    const archive = await readArchive(tx);
    if (!archive.campaigns[id]) throw new ApiError('CONFLICT', 'Kampanya arşivde değil');
    delete archive.campaigns[id];
    await writeArchive(tx, archive);
    // Geri alınan kampanya DURAKLATILMIŞ döner: puan basmaya başlaması bilinçli bir "Yayına al" ister.
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'SEASONAL_CAMPAIGN_RESTORE',
        entity: 'SeasonalCampaign',
        entityId: id,
        newData: snapshotCampaign(row),
        ...actor.meta,
      },
    });
    return { id, version: campaignVersion(row) };
  });
}

// ───────────────────────────── Yazım: konsept ─────────────────────────────

function conceptData(d: ConceptInput) {
  return {
    name: d.name,
    description: d.description,
    priority: d.priority,
    backgroundEffect: d.backgroundEffect,
    themePresetId: d.themePresetId,
    bannerText: d.bannerText,
    bannerEmoji: d.bannerEmoji,
    isActive: d.isActive,
    startDate: new Date(d.startDate),
    endDate: new Date(d.endDate),
  };
}

async function lockedConcept(tx: Tx, id: string, baseVersion: string | undefined): Promise<RawConcept> {
  await lockResource(tx, `seasonalConcept:${id}`);
  const row = (await tx.seasonalConcept.findUnique({ where: { id } })) as RawConcept | null;
  if (!row) throw new ApiError('NOT_FOUND', 'Konsept bulunamadı');
  if (baseVersion !== undefined && row.updatedAt.toISOString() !== baseVersion) throw conflictError();
  return row;
}

/** Görünüm önbelleğini yanıt sonrası tazeler; hata kaydı bozmaz (best-effort). */
async function resyncConcept(): Promise<boolean> {
  try {
    await syncActiveSeasonalConcept();
    return true;
  } catch (err) {
    console.error('[campaigns-calendar] konsept önbellek senkronu başarısız (kayıt yazıldı):', err);
    return false;
  }
}

export async function createConcept(raw: unknown, actor: Actor) {
  const d = conceptInputSchema.parse(raw);
  const created = await prisma.$transaction(async (tx) => {
    const row = (await tx.seasonalConcept.create({ data: conceptData(d) })) as RawConcept;
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'SEASONAL_CONCEPT_CREATE',
        entity: 'SeasonalConcept',
        entityId: row.id,
        newData: snapshotConcept(row),
        ...actor.meta,
      },
    });
    return row;
  });
  const synced = await resyncConcept();
  return { id: created.id, version: created.updatedAt.toISOString(), synced };
}

export async function updateConcept(id: string, raw: unknown, baseVersion: string | undefined, actor: Actor) {
  if (!baseVersion) throw new ApiError('BAD_REQUEST', 'Sürüm bilgisi (baseVersion) gerekli');
  const d = conceptInputSchema.parse(raw);
  const after = await prisma.$transaction(async (tx) => {
    const before = await lockedConcept(tx, id, baseVersion);
    if ((await readArchive(tx)).concepts[id] && d.isActive) {
      throw new ApiError('CONFLICT', 'Arşivdeki konsept etkinleştirilemez; önce arşivden çıkarın.');
    }
    const row = (await tx.seasonalConcept.update({ where: { id }, data: conceptData(d) })) as RawConcept;
    const o = snapshotConcept(before);
    const n = snapshotConcept(row);
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'SEASONAL_CONCEPT_UPDATE',
        entity: 'SeasonalConcept',
        entityId: id,
        oldData: o,
        newData: { ...n, changedFields: changed(o, n) } as Prisma.InputJsonObject,
        ...actor.meta,
      },
    });
    return row;
  });
  const synced = await resyncConcept();
  return { id, version: after.updatedAt.toISOString(), synced };
}

export async function setConceptActive(id: string, isActive: boolean, baseVersion: string, actor: Actor) {
  const after = await prisma.$transaction(async (tx) => {
    const before = await lockedConcept(tx, id, baseVersion);
    if (isActive && (await readArchive(tx)).concepts[id]) {
      throw new ApiError('CONFLICT', 'Arşivdeki konsept etkinleştirilemez; önce arşivden çıkarın.');
    }
    const row = (await tx.seasonalConcept.update({ where: { id }, data: { isActive } })) as RawConcept;
    const o = snapshotConcept(before);
    const n = snapshotConcept(row);
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'SEASONAL_CONCEPT_UPDATE',
        entity: 'SeasonalConcept',
        entityId: id,
        oldData: o,
        newData: { ...n, changedFields: changed(o, n) } as Prisma.InputJsonObject,
        ...actor.meta,
      },
    });
    return row;
  });
  const synced = await resyncConcept();
  return { id, version: after.updatedAt.toISOString(), synced };
}

export async function archiveConcept(id: string, reason: string, baseVersion: string, actor: Actor) {
  const after = await prisma.$transaction(async (tx) => {
    const before = await lockedConcept(tx, id, baseVersion);
    await lockResource(tx, ARCHIVE_KEY);
    const archive = await readArchive(tx);
    if (archive.concepts[id]) throw new ApiError('CONFLICT', 'Konsept zaten arşivde');
    const row = (await tx.seasonalConcept.update({ where: { id }, data: { isActive: false } })) as RawConcept;
    archive.concepts[id] = { at: new Date().toISOString(), reason, by: actor.id };
    await writeArchive(tx, archive);
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'SEASONAL_CONCEPT_ARCHIVE',
        entity: 'SeasonalConcept',
        entityId: id,
        oldData: snapshotConcept(before),
        newData: { ...snapshotConcept(row), reason, changedFields: before.isActive ? ['isActive'] : [] } as Prisma.InputJsonObject,
        ...actor.meta,
      },
    });
    return row;
  });
  const synced = await resyncConcept();
  return { id, version: after.updatedAt.toISOString(), synced };
}

export async function restoreConcept(id: string, baseVersion: string, actor: Actor) {
  const row = await prisma.$transaction(async (tx) => {
    const r = await lockedConcept(tx, id, baseVersion);
    await lockResource(tx, ARCHIVE_KEY);
    const archive = await readArchive(tx);
    if (!archive.concepts[id]) throw new ApiError('CONFLICT', 'Konsept arşivde değil');
    delete archive.concepts[id];
    await writeArchive(tx, archive);
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: 'SEASONAL_CONCEPT_RESTORE',
        entity: 'SeasonalConcept',
        entityId: id,
        newData: snapshotConcept(r),
        ...actor.meta,
      },
    });
    return r;
  });
  return { id, version: row.updatedAt.toISOString(), synced: true };
}

// ───────────────────────────── Önizleme ─────────────────────────────

/** Son 7 günde kampanyanın uygulandığı yollarda (geri bildirim + tüketim pasif puanı) basılan. */
async function baselineWeek(now: Date): Promise<{ points: number; events: number }> {
  const agg = await prisma.pointsLedger.aggregate({
    where: {
      status: 'posted',
      currency: 'POINTS',
      source: { in: ['feedback', 'dealer_passive'] },
      createdAt: { gte: new Date(now.getTime() - 7 * DAY) },
    },
    _sum: { delta: true },
    _count: { _all: true },
  });
  return { points: Math.max(0, agg._sum.delta ?? 0), events: agg._count._all };
}

export async function previewDraft(kind: 'campaign' | 'concept', raw: unknown, excludeId: string | null, now = new Date()): Promise<PreviewResult> {
  const archive = await readArchive();
  if (kind === 'campaign') {
    const parsed = campaignInputSchema.safeParse(raw);
    if (!parsed.success) return { valid: false, conflicts: [], estimate: null, wouldWinNow: null };
    const d = parsed.data;
    const start = new Date(d.startDate);
    const end = new Date(d.endDate);
    const [peers, base] = await Promise.all([
      prisma.seasonalCampaign.findMany({
        where: {
          ...(excludeId ? { id: { not: excludeId } } : {}),
          endDate: { gte: start },
          startDate: { lte: end },
        },
        select: CAMPAIGN_SELECT,
        take: 50,
      }) as Promise<RawCampaign[]>,
      baselineWeek(now),
    ]);
    const DRAFT = '__draft__';
    const draftRaw: RawCampaign = {
      id: DRAFT,
      ...campaignData(d),
      name: d.name || 'Bu taslak',
      conditions: d.minLevel !== null || d.budgetPoints !== null ? { ...(d.minLevel !== null ? { minLevel: d.minLevel } : {}), ...(d.budgetPoints !== null ? { budgetPoints: d.budgetPoints } : {}) } : null,
      createdAt: now,
    };
    const spent = await budgetSpentFor(peers, now);
    const bases = [campaignBase(draftRaw, EMPTY_ARCHIVE), ...peers.map((c) => campaignBase(c, archive, spent.get(c.id) ?? null))];
    const conflicts = detectConflicts(bases, [], new Date(Math.min(now.getTime(), start.getTime()))).filter((c) =>
      c.itemIds.includes(DRAFT)
    );
    const t = now.getTime();
    const coversNow = start.getTime() <= t && t <= end.getTime() && d.isActive;
    const winner = coversNow ? campaignWinnerAt(bases, t) : null;
    const draftView = bases[0];
    return {
      valid: true,
      conflicts,
      estimate: estimateCampaignExtra({
        baselineWeekPoints: base.points,
        baselineWeekEvents: base.events,
        multiplier: d.multiplier,
        bonus: d.bonusPoints,
        windowMs: end.getTime() - Math.max(start.getTime(), Math.min(t, end.getTime())),
        budgetPoints: d.budgetPoints,
        targeted: draftView.targeted,
      }),
      wouldWinNow: coversNow ? (draftView.targeted ? null : winner?.id === DRAFT) : null,
    };
  }

  const parsed = conceptInputSchema.safeParse(raw);
  if (!parsed.success) return { valid: false, conflicts: [], estimate: null, wouldWinNow: null };
  const d = parsed.data;
  const start = new Date(d.startDate);
  const end = new Date(d.endDate);
  const [peers, campaigns] = await Promise.all([
    prisma.seasonalConcept.findMany({
      where: { ...(excludeId ? { id: { not: excludeId } } : {}), endDate: { gte: start }, startDate: { lte: end } },
      take: 50,
    }) as Promise<RawConcept[]>,
    prisma.seasonalCampaign.findMany({ where: { endDate: { gte: start }, startDate: { lte: end } }, select: CAMPAIGN_SELECT, take: 50 }) as Promise<RawCampaign[]>,
  ]);
  const DRAFT = '__draft__';
  const draft = toConceptView({ id: DRAFT, ...conceptData(d), createdAt: now, updatedAt: now }, null);
  const bases = [draft, ...peers.map((c) => toConceptView(c, archive.concepts[c.id] ?? null))];
  const cBases = campaigns.map((c) => campaignBase(c, archive));
  const evalAt = new Date(Math.min(now.getTime(), start.getTime()));
  const conflicts = detectConflicts(cBases, bases, evalAt).filter((c) => c.itemIds.includes(DRAFT));
  const t = now.getTime();
  const coversNow = start.getTime() <= t && t <= end.getTime() && d.isActive;
  return {
    valid: true,
    conflicts,
    estimate: null,
    wouldWinNow: coversNow ? withConceptStatus(bases, now)[0].status === 'live' : null,
  };
}

// ───────────────────────────── Rozet seçenekleri ─────────────────────────────

export async function listBadgeOptions(): Promise<Array<{ id: string; name: string; icon: string; rarity: string }>> {
  return prisma.badge.findMany({
    where: { isActive: true, archivedAt: null },
    select: { id: true, name: true, icon: true, rarity: true },
    orderBy: { name: 'asc' },
    take: 300,
  });
}
