/**
 * Bağış kampanyaları — admin sunucu çekirdeği (/admin/donations).
 *
 * Denetim (docs/audit/2026-10-08/admin/admin_donations.md) kapanışları:
 *  - B4: tek sözleşme (`./contract.ts` ↔ müşteri `impact.ts`): kategori enum, goal ≥ 1, perPoint > 0.
 *  - B5: KPI'lar filtreden bağımsız, gerçek sayımlarla.
 *  - B6: hatalar `defineRoute` zarfında (P2025 → 404, DB → 503); "200 + sıfırlar" yok.
 *  - B8: her yazma (oluştur/düzenle/durum/uzlaştır) denetim kaydıyla AYNI transaction'da.
 *  - B11/B15: işlemler imleçli + filtreli; CSV sunucuda, tüm filtreye uyan kayıtlar, BOM'lu.
 *  - B14: "şeffaf toplam" — kayıtlı ilerleme (`current`) gerçek bağış toplamıyla yan yana;
 *    fark varsa gerekçeli "uzlaştır" (puan basmaz, yalnız proje ilerlemesini düzeltir).
 *  - Makbuz: her bağış `QX-B-…` makbuz numarası + puan defteri satırıyla eşleştirilir.
 * Silme yok — arşiv (bağış geçmişi korunur).
 */
import { Prisma } from '@prisma/client';
import type { prisma as prismaClient } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { getModuleControls } from '@/lib/module-gate';
import { impactValue, normalizeCategory, parseImpact, parseTags, projectProgress } from '@/lib/customer-wallet/donate/impact';
import { receiptNumber } from '@/lib/customer-wallet/donate/service';
import { decodeCursor, encodeCursor } from '@/lib/customer-wallet/cursor';
import {
  PROJECT_STATUSES,
  projectStatus,
  type AuditItem,
  type DonationStats,
  type ProjectAction,
  type ProjectActionInput,
  type ProjectDetail,
  type ProjectListPage,
  type ProjectListQuery,
  type ProjectRow,
  type ProjectStatus,
  type ProjectUpsertValues,
  type TransactionDetail,
  type TransactionPage,
  type TransactionQuery,
  type TransactionRow,
} from './contract';

type Db = typeof prismaClient;
type Req = { headers: { get(name: string): string | null } } | null | undefined;

export const PROJECT_ENTITY = 'DonationProject';
const LIST_CAP = 2_000;
export const EXPORT_CAP = 20_000;
const DAY_MS = 86_400_000;

// ───────────────────────────── Yardımcılar ─────────────────────────────

/** İstanbul günü (YYYY-MM-DD) → o günün başlangıç anı (UTC+3, yaz saati yok). */
export function istanbulDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}

export function istanbulDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Son `n` İstanbul günü (eski → yeni). */
export function lastDays(n: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  const today = istanbulDayStart(istanbulDay(now));
  for (let i = n - 1; i >= 0; i--) out.push(istanbulDay(new Date(today.getTime() - i * DAY_MS + 12 * 3600_000)));
  return out;
}

export function statusWhere(status: ProjectStatus, now: Date): Prisma.DonationProjectWhereInput {
  switch (status) {
    case 'archived':
      return { archivedAt: { not: null } };
    case 'inactive':
      return { archivedAt: null, isActive: false };
    case 'scheduled':
      return { archivedAt: null, isActive: true, startDate: { gt: now } };
    case 'ended':
      return { archivedAt: null, isActive: true, startDate: { lte: now }, endDate: { lte: now } };
    case 'live':
      return { archivedAt: null, isActive: true, startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gt: now } }] };
  }
}

function readActor(snapshot: unknown, user: { name: string | null; email: string | null } | null): string | null {
  if (snapshot && typeof snapshot === 'object') {
    const s = snapshot as Record<string, unknown>;
    if (typeof s.name === 'string' && s.name) return s.name;
    if (typeof s.email === 'string' && s.email) return s.email;
  }
  return user?.name ?? user?.email ?? null;
}

const ACTION_LABEL: Record<string, string> = {
  DONATION_PROJECT_CREATE: 'Kampanya oluşturuldu',
  DONATION_PROJECT_UPDATE: 'Kampanya düzenlendi',
  DONATION_PROJECT_ACTIVATE: 'Bağışa açıldı',
  DONATION_PROJECT_DEACTIVATE: 'Bağışa kapatıldı',
  DONATION_PROJECT_FEATURE: 'Öne çıkarıldı',
  DONATION_PROJECT_UNFEATURE: 'Öne çıkarma kaldırıldı',
  DONATION_PROJECT_ARCHIVE: 'Arşivlendi',
  DONATION_PROJECT_RESTORE: 'Arşivden çıkarıldı',
  DONATION_PROJECT_RECONCILE: 'İlerleme gerçek toplamla uzlaştırıldı',
};

function diffSummary(oldData: unknown, newData: unknown, action: string): string {
  const base = ACTION_LABEL[action] ?? action;
  if (action !== 'DONATION_PROJECT_UPDATE' || !oldData || !newData || typeof oldData !== 'object' || typeof newData !== 'object') {
    const reason = newData && typeof newData === 'object' ? (newData as Record<string, unknown>).reason : null;
    return typeof reason === 'string' && reason ? `${base} — ${reason}` : base;
  }
  const o = oldData as Record<string, unknown>;
  const n = newData as Record<string, unknown>;
  const labels: Record<string, string> = {
    name: 'ad',
    description: 'açıklama',
    icon: 'simge',
    category: 'kategori',
    goal: 'hedef',
    impact: 'etki oranı',
    tags: 'etiketler',
    isFeatured: 'öne çıkarma',
    isActive: 'durum',
    startDate: 'başlangıç',
    endDate: 'bitiş',
  };
  const changed = Object.keys(labels).filter((k) => JSON.stringify(o[k] ?? null) !== JSON.stringify(n[k] ?? null));
  return changed.length ? `${base}: ${changed.map((k) => labels[k]).join(', ')}` : base;
}

async function moduleEnabled(): Promise<boolean> {
  try {
    const controls = (await getModuleControls()) as Record<string, boolean | undefined>;
    return controls.donations !== false;
  } catch {
    return true;
  }
}

type Agg = { raised: number; donations: number; donors: number; last: Date | null };

async function aggregatesFor(db: Db, ids: string[] | null): Promise<Map<string, Agg>> {
  const where = ids ? { projectId: { in: ids } } : {};
  if (ids && ids.length === 0) return new Map();
  const [sums, donors] = await Promise.all([
    db.donation.groupBy({ by: ['projectId'], where, _sum: { points: true }, _count: { _all: true }, _max: { createdAt: true } }),
    ids
      ? db.$queryRaw<Array<{ projectId: string; n: bigint | number }>>(
          Prisma.sql`SELECT "projectId", COUNT(DISTINCT "userId")::bigint AS n FROM "Donation" WHERE "projectId" IN (${Prisma.join(ids)}) GROUP BY "projectId"`
        )
      : db.$queryRaw<Array<{ projectId: string; n: bigint | number }>>(
          Prisma.sql`SELECT "projectId", COUNT(DISTINCT "userId")::bigint AS n FROM "Donation" GROUP BY "projectId"`
        ),
  ]);
  const donorMap = new Map(donors.map((d) => [d.projectId, Number(d.n)]));
  return new Map(
    sums.map((s) => [
      s.projectId,
      { raised: s._sum.points ?? 0, donations: s._count._all ?? 0, donors: donorMap.get(s.projectId) ?? 0, last: s._max.createdAt ?? null },
    ])
  );
}

const PROJECT_SELECT = {
  id: true,
  name: true,
  description: true,
  icon: true,
  category: true,
  goal: true,
  current: true,
  impact: true,
  tags: true,
  isActive: true,
  isFeatured: true,
  archivedAt: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DonationProjectSelect;
type ProjectRecord = Prisma.DonationProjectGetPayload<{ select: typeof PROJECT_SELECT }>;

function toRow(p: ProjectRecord, agg: Agg | undefined, now: Date): ProjectRow {
  const progress = projectProgress(p.current, p.goal);
  return {
    id: p.id,
    name: p.name,
    icon: p.icon,
    category: normalizeCategory(p.category),
    rawCategory: p.category,
    status: projectStatus(p, now),
    featured: p.isFeatured,
    goal: p.goal,
    current: p.current,
    raised: agg?.raised ?? 0,
    donations: agg?.donations ?? 0,
    donors: agg?.donors ?? 0,
    percent: progress.percent,
    completed: progress.completed,
    impact: parseImpact(p.impact),
    startDate: p.startDate.toISOString(),
    endDate: p.endDate ? p.endDate.toISOString() : null,
    lastDonationAt: agg?.last ? agg.last.toISOString() : null,
    updatedAt: p.updatedAt.toISOString(),
  };
}

// ───────────────────────────── KPI ─────────────────────────────

type DayRow = { day: string; points: bigint | number | null; n: bigint | number };

export async function getDonationStats(db: Db, now: Date = new Date()): Promise<DonationStats> {
  const days = lastDays(30, now);
  const since = istanbulDayStart(days[0]);
  const [all, donorRows, dayRows, statusCounts, completedRows, mismatchRows, ledger, unreceiptedRows, enabled] = await Promise.all([
    db.donation.aggregate({ _sum: { points: true }, _count: { _all: true } }),
    db.$queryRaw<Array<{ n: bigint | number }>>(Prisma.sql`SELECT COUNT(DISTINCT "userId")::bigint AS n FROM "Donation"`),
    db.$queryRaw<DayRow[]>(Prisma.sql`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS day,
             SUM("points")::bigint AS points, COUNT(*)::bigint AS n
        FROM "Donation" WHERE "createdAt" >= ${since}
       GROUP BY 1`),
    Promise.all(PROJECT_STATUSES.map((s) => db.donationProject.count({ where: statusWhere(s, now) }))),
    db.$queryRaw<Array<{ n: bigint | number }>>(
      Prisma.sql`SELECT COUNT(*)::bigint AS n FROM "DonationProject" WHERE "archivedAt" IS NULL AND "goal" > 0 AND "current" >= "goal"`
    ),
    db.$queryRaw<Array<{ n: bigint | number }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS n FROM "DonationProject" p
        LEFT JOIN (SELECT "projectId", SUM("points") AS s FROM "Donation" GROUP BY "projectId") d ON d."projectId" = p."id"
       WHERE p."current" <> COALESCE(d.s, 0)`),
    db.pointsLedger.aggregate({ where: { source: 'donation', status: 'posted' }, _sum: { delta: true } }),
    db.$queryRaw<Array<{ n: bigint | number }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS n FROM "Donation" d
       WHERE NOT EXISTS (SELECT 1 FROM "PointsLedger" l WHERE l."source" = 'donation' AND l."sourceId" = d."id")`),
    moduleEnabled(),
  ]);
  const byDay = new Map(dayRows.map((r) => [r.day, { points: Number(r.points ?? 0), donations: Number(r.n) }]));
  const series = days.map((day) => ({ day, points: byDay.get(day)?.points ?? 0, donations: byDay.get(day)?.donations ?? 0 }));
  const last30Points = series.reduce((s, d) => s + d.points, 0);
  const last30Donations = series.reduce((s, d) => s + d.donations, 0);
  const projects = Object.fromEntries(PROJECT_STATUSES.map((s, i) => [s, statusCounts[i]])) as Record<ProjectStatus, number>;
  const donations = all._count._all ?? 0;
  const totalPoints = all._sum.points ?? 0;
  return {
    totalPoints,
    donations,
    donors: Number(donorRows[0]?.n ?? 0),
    last30Points,
    last30Donations,
    avgDonation: donations > 0 ? Math.round(totalPoints / donations) : null,
    series,
    projects: { ...projects, total: statusCounts.reduce((s, n) => s + n, 0), completed: Number(completedRows[0]?.n ?? 0) },
    mismatchedProjects: Number(mismatchRows[0]?.n ?? 0),
    ledgerPoints: Math.abs(ledger._sum.delta ?? 0),
    unreceiptedDonations: Number(unreceiptedRows[0]?.n ?? 0),
    moduleEnabled: enabled,
    asOf: now.toISOString(),
  };
}

// ───────────────────────────── Liste ─────────────────────────────

export async function listProjects(db: Db, q: ProjectListQuery, now: Date = new Date()): Promise<ProjectListPage> {
  const and: Prisma.DonationProjectWhereInput[] = [];
  if (q.status) and.push(statusWhere(q.status, now));
  else and.push({ archivedAt: null });
  if (q.category) and.push({ category: q.category });
  if (q.q) and.push({ OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] });
  const projects = await db.donationProject.findMany({ where: { AND: and }, select: PROJECT_SELECT, orderBy: { createdAt: 'desc' }, take: LIST_CAP });
  const aggs = await aggregatesFor(db, projects.map((p) => p.id));
  const rows = projects.map((p) => toRow(p, aggs.get(p.id), now));
  const collator = new Intl.Collator('tr-TR');
  rows.sort((a, b) => {
    switch (q.sort) {
      case 'progress':
        return (b.percent ?? -1) - (a.percent ?? -1);
      case 'raised':
        return b.raised - a.raised;
      case 'goal':
        return b.goal - a.goal;
      case 'name':
        return collator.compare(a.name, b.name);
      default:
        return Number(b.featured) - Number(a.featured) || 0;
    }
  });
  const start = (q.page - 1) * q.size;
  return { items: rows.slice(start, start + q.size), total: rows.length, page: q.page, size: q.size };
}

// ───────────────────────────── Ayrıntı ─────────────────────────────

const TX_SELECT = {
  id: true,
  points: true,
  message: true,
  isPublic: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, name: true, icon: true } },
} satisfies Prisma.DonationSelect;
type TxRecord = Prisma.DonationGetPayload<{ select: typeof TX_SELECT }>;

function toTx(d: TxRecord): TransactionRow {
  return {
    id: d.id,
    receiptNo: receiptNumber(d.id),
    at: d.createdAt.toISOString(),
    points: d.points,
    message: d.message?.trim() || null,
    isPublic: d.isPublic,
    user: { id: d.user.id, name: d.user.name, email: d.user.email },
    project: { id: d.project.id, name: d.project.name, icon: d.project.icon },
  };
}

export async function getProjectDetail(db: Db, id: string, now: Date = new Date()): Promise<ProjectDetail> {
  const p = await db.donationProject.findUnique({ where: { id }, select: PROJECT_SELECT });
  if (!p) throw new ApiError('NOT_FOUND', 'Bağış kampanyası bulunamadı.');
  const days = lastDays(30, now);
  const since = istanbulDayStart(days[0]);
  const [aggs, dayRows, top, recent, audits] = await Promise.all([
    aggregatesFor(db, [id]),
    db.$queryRaw<DayRow[]>(Prisma.sql`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS day,
             SUM("points")::bigint AS points, COUNT(*)::bigint AS n
        FROM "Donation" WHERE "projectId" = ${id} AND "createdAt" >= ${since}
       GROUP BY 1`),
    db.donation.groupBy({ by: ['userId'], where: { projectId: id }, _sum: { points: true }, _count: { _all: true }, orderBy: { _sum: { points: 'desc' } }, take: 5 }),
    db.donation.findMany({ where: { projectId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10, select: TX_SELECT }),
    db.auditLog.findMany({
      where: { entity: PROJECT_ENTITY, entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, createdAt: true, action: true, oldData: true, newData: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  const users = top.length ? await db.user.findMany({ where: { id: { in: top.map((t) => t.userId) } }, select: { id: true, name: true, email: true } }) : [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const byDay = new Map(dayRows.map((r) => [r.day, Number(r.points ?? 0)]));
  const history: AuditItem[] = audits.map((a) => ({
    id: a.id,
    at: a.createdAt.toISOString(),
    actor: readActor(a.actorSnapshot, a.user),
    action: a.action,
    summary: diffSummary(a.oldData, a.newData, a.action),
  }));
  return {
    ...toRow(p, aggs.get(id), now),
    description: p.description,
    tags: parseTags(p.tags),
    isActive: p.isActive,
    archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    series: days.map((day) => ({ day, points: byDay.get(day) ?? 0 })),
    topDonors: top.map((t) => {
      const u = userMap.get(t.userId);
      return { userId: t.userId, name: u?.name || 'Adsız kullanıcı', email: u?.email ?? null, points: t._sum.points ?? 0, donations: t._count._all ?? 0 };
    }),
    recent: recent.map(toTx),
    history,
  };
}

// ───────────────────────────── Yazma ─────────────────────────────

function toData(v: ProjectUpsertValues) {
  return {
    name: v.name,
    description: v.description,
    icon: v.icon,
    category: v.category,
    goal: v.goal,
    impact: { unit: v.impact.unit, label: v.impact.label, perPoint: v.impact.perPoint } as Prisma.InputJsonValue,
    tags: v.tags as Prisma.InputJsonValue,
    isFeatured: v.isFeatured,
    isActive: v.isActive,
    startDate: new Date(v.startDate),
    endDate: v.endDate ? new Date(v.endDate) : null,
  };
}

function snapshot(p: ProjectRecord) {
  return {
    name: p.name,
    description: p.description,
    icon: p.icon,
    category: p.category,
    goal: p.goal,
    current: p.current,
    impact: p.impact,
    tags: p.tags,
    isFeatured: p.isFeatured,
    isActive: p.isActive,
    archivedAt: p.archivedAt,
    startDate: p.startDate,
    endDate: p.endDate,
  };
}

export async function createProject(db: Db, v: ProjectUpsertValues, actor: AuditActor, request?: Req): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const created = await tx.donationProject.create({ data: toData(v), select: PROJECT_SELECT });
    await tx.auditLog.create({
      data: auditEntry(actor, { action: 'DONATION_PROJECT_CREATE', entity: PROJECT_ENTITY, entityId: created.id, newData: snapshot(created) }, request),
    });
    return { id: created.id };
  });
}

export async function updateProject(
  db: Db,
  id: string,
  input: { values: ProjectUpsertValues; baseUpdatedAt: string },
  actor: AuditActor,
  request?: Req
): Promise<{ id: string; updatedAt: string }> {
  return db.$transaction(async (tx) => {
    const current = await tx.donationProject.findUnique({ where: { id }, select: PROJECT_SELECT });
    if (!current) throw new ApiError('NOT_FOUND', 'Bağış kampanyası bulunamadı.');
    if (current.archivedAt) throw new ApiError('CONFLICT', 'Arşivdeki kampanya düzenlenemez. Önce arşivden çıkarın.');
    const res = await tx.donationProject.updateMany({ where: { id, updatedAt: new Date(input.baseUpdatedAt) }, data: toData(input.values) });
    if (res.count === 0) {
      throw new ApiError('VERSION_CONFLICT', 'Bu kampanya siz düzenlerken başka biri tarafından değiştirildi ya da bir bağış geldi. Güncel hali yükleyip tekrar deneyin.', { status: 409 });
    }
    const after = await tx.donationProject.findUniqueOrThrow({ where: { id }, select: PROJECT_SELECT });
    await tx.auditLog.create({
      data: auditEntry(actor, { action: 'DONATION_PROJECT_UPDATE', entity: PROJECT_ENTITY, entityId: id, oldData: snapshot(current), newData: snapshot(after) }, request),
    });
    return { id, updatedAt: after.updatedAt.toISOString() };
  });
}

const ACTION_AUDIT: Record<ProjectAction, string> = {
  activate: 'DONATION_PROJECT_ACTIVATE',
  deactivate: 'DONATION_PROJECT_DEACTIVATE',
  feature: 'DONATION_PROJECT_FEATURE',
  unfeature: 'DONATION_PROJECT_UNFEATURE',
  archive: 'DONATION_PROJECT_ARCHIVE',
  restore: 'DONATION_PROJECT_RESTORE',
  reconcile: 'DONATION_PROJECT_RECONCILE',
};

export async function projectAction(
  db: Db,
  id: string,
  input: ProjectActionInput,
  actor: AuditActor,
  request?: Req
): Promise<{ id: string; status: ProjectStatus; current: number }> {
  return db.$transaction(async (tx) => {
    const p = await tx.donationProject.findUnique({ where: { id }, select: PROJECT_SELECT });
    if (!p) throw new ApiError('NOT_FOUND', 'Bağış kampanyası bulunamadı.');
    const archived = !!p.archivedAt;
    let data: Prisma.DonationProjectUpdateInput;
    let extra: Record<string, unknown> = {};
    switch (input.action) {
      case 'activate':
        if (archived) throw new ApiError('CONFLICT', 'Arşivdeki kampanya bağışa açılamaz. Önce arşivden çıkarın.');
        if (parseImpact(p.impact) == null || p.goal < 1) {
          throw new ApiError('VALIDATION', 'Kampanyanın hedefi ve etki oranı geçerli değil. Önce düzenleyip kaydedin.');
        }
        data = { isActive: true };
        break;
      case 'deactivate':
        data = { isActive: false };
        break;
      case 'feature':
        if (archived) throw new ApiError('CONFLICT', 'Arşivdeki kampanya öne çıkarılamaz.');
        data = { isFeatured: true };
        break;
      case 'unfeature':
        data = { isFeatured: false };
        break;
      case 'archive':
        if (archived) throw new ApiError('CONFLICT', 'Kampanya zaten arşivde.');
        data = { archivedAt: new Date(), isActive: false, isFeatured: false };
        break;
      case 'restore':
        if (!archived) throw new ApiError('CONFLICT', 'Kampanya arşivde değil.');
        // Arşivden KAPALI döner; operatör gözden geçirip bilinçli olarak açar.
        data = { archivedAt: null, isActive: false };
        break;
      case 'reconcile': {
        // Satırı kilitle: arada gelen bağış toplamı değiştirmesin.
        await tx.$executeRaw`SELECT 1 FROM "DonationProject" WHERE "id" = ${id} FOR UPDATE`;
        const sum = await tx.donation.aggregate({ where: { projectId: id }, _sum: { points: true } });
        const total = sum._sum.points ?? 0;
        if (input.expectedTotal !== undefined && input.expectedTotal !== total) {
          throw new ApiError('VERSION_CONFLICT', 'Bu arada yeni bağış geldi; gerçek toplam değişti. Sayfayı yenileyip tekrar deneyin.', { status: 409 });
        }
        if (total === p.current) throw new ApiError('CONFLICT', 'Kayıtlı ilerleme zaten gerçek toplamla aynı.');
        data = { current: total };
        extra = { from: p.current, to: total };
        break;
      }
    }
    const after = await tx.donationProject.update({ where: { id }, data, select: PROJECT_SELECT });
    await tx.auditLog.create({
      data: auditEntry(
        actor,
        {
          action: ACTION_AUDIT[input.action],
          entity: PROJECT_ENTITY,
          entityId: id,
          oldData: snapshot(p),
          newData: { ...snapshot(after), ...extra, ...(input.reason ? { reason: input.reason } : {}) },
        },
        request
      ),
    });
    return { id, status: projectStatus(after), current: after.current };
  });
}

// ───────────────────────────── İşlemler ─────────────────────────────

export function transactionWhere(q: Omit<TransactionQuery, 'cursor' | 'limit'>): Prisma.DonationWhereInput {
  const and: Prisma.DonationWhereInput[] = [];
  if (q.projectId) and.push({ projectId: q.projectId });
  if (q.q) and.push({ user: { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } });
  if (q.from) and.push({ createdAt: { gte: istanbulDayStart(q.from) } });
  if (q.to) and.push({ createdAt: { lt: new Date(istanbulDayStart(q.to).getTime() + DAY_MS) } });
  if (q.minPoints) and.push({ points: { gte: q.minPoints } });
  if (q.visibility) and.push({ isPublic: q.visibility === 'public' });
  return and.length ? { AND: and } : {};
}

export async function listTransactions(db: Db, q: TransactionQuery): Promise<TransactionPage> {
  const cursor = decodeCursor(q.cursor);
  const base = transactionWhere(q);
  const where: Prisma.DonationWhereInput = cursor
    ? { AND: [base, { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }] }] }
    : base;
  const rows = await db.donation.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: q.limit + 1, select: TX_SELECT });
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return { items: page.map(toTx), nextCursor: rows.length > q.limit && last ? encodeCursor(last.createdAt, last.id) : null };
}

export async function getTransaction(db: Db, id: string): Promise<TransactionDetail> {
  const d = await db.donation.findUnique({ where: { id }, select: { ...TX_SELECT, project: { select: { id: true, name: true, icon: true, impact: true } } } });
  if (!d) throw new ApiError('NOT_FOUND', 'Bağış kaydı bulunamadı.');
  const ledger = await db.pointsLedger.findFirst({
    where: { source: 'donation', sourceId: d.id, userId: d.user.id },
    select: { id: true, delta: true, balanceAfter: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const rule = parseImpact(d.project.impact);
  const value = impactValue(d.points, rule);
  return {
    ...toTx({ ...d, project: { id: d.project.id, name: d.project.name, icon: d.project.icon } }),
    impact: rule && value != null ? { value, unit: rule.unit, label: rule.label } : null,
    ledger: ledger ? { id: ledger.id, delta: ledger.delta, balanceAfter: ledger.balanceAfter, status: ledger.status, at: ledger.createdAt.toISOString() } : null,
  };
}

/** CSV hücresi: tırnak kaçışı + formül enjeksiyonu koruması. */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_DATE = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export async function exportTransactionsCsv(db: Db, q: Omit<TransactionQuery, 'cursor' | 'limit'>): Promise<{ csv: string; rows: number; truncated: boolean }> {
  const rows = await db.donation.findMany({
    where: transactionWhere(q),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: EXPORT_CAP + 1,
    select: { ...TX_SELECT, project: { select: { id: true, name: true, icon: true, category: true } } },
  });
  const truncated = rows.length > EXPORT_CAP;
  const header = ['Makbuz No', 'Tarih (İstanbul)', 'Kampanya', 'Kategori', 'Kullanıcı', 'E-posta', 'Puan', 'Görünürlük', 'Mesaj'];
  const lines = rows.slice(0, EXPORT_CAP).map((d) =>
    [
      receiptNumber(d.id),
      CSV_DATE.format(d.createdAt),
      d.project.name,
      d.project.category,
      d.user.name ?? '',
      d.user.email ?? '',
      d.points,
      d.isPublic ? 'Herkese açık' : 'Gizli',
      d.message ?? '',
    ]
      .map(csvCell)
      .join(';')
  );
  return { csv: `﻿${[header.map(csvCell).join(';'), ...lines].join('\r\n')}\r\n`, rows: Math.min(rows.length, EXPORT_CAP), truncated };
}
