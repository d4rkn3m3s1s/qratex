/**
 * Vakalar — sunucu katmanı (liste, özet, detay, oluşturma, durum makinesi, görev üretimi).
 *
 * Kapanan denetim bulguları (dealer_incidents.md):
 *  - 2 / P0-11: atanan kişi yalnız bayinin kendisi ya da AKTİF personeli (`validateAssignee`);
 *    yanıtta e-posta yok (yalnız ad + rol).
 *  - 4: yaşam döngüsü (Üstlen · Ata · İşleme al · Çöz (not + kök neden) · Yeniden aç) sunucu
 *    durum makinesinden geçer; her geçiş `AuditLog`'a yazılır ve zaman çizelgesinde görünür.
 *  - 5: liste DTO'su zaman, açıklama özeti, tür etiketi (katalog), masa bilgisi, kanıt yorum
 *    sayısı ve sorumlu taşır; sıralama önem → son tarih → yeni.
 *  - 6/7: sayfa/filtre sunucu tarafında doğrulanır; hata zarfı v2 (route katmanı).
 *  - 8: tür katalogdan (`MANUAL_INCIDENT_TYPES`), başlık ≤ 140, açıklama ≤ 4000; elle açılan
 *    vakaya `metadata.source = 'manual'` yazılır (sistem vakasından ayrışır).
 *  - Masa sinyali: vaka çözülünce bağlı `TablePulse.resolvedAt` doldurulur (sağlık skoru).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { validateAssignee } from '@/lib/dealer/assignee';
import {
  INCIDENT_SEVERITIES,
  INCIDENT_TYPES,
  OPEN_INCIDENT_STATUSES,
  allowedIncidentTransitions,
  applyIncidentPatch,
  defaultDueAt,
  incidentTypeDef,
  isIncidentOverdue,
  readIncidentMeta,
  sourceOfGroup,
  toIncidentSeverity,
  toIncidentStatus,
  typesOfGroup,
  type IncidentEvent,
  type IncidentPatch,
  type IncidentSeverity,
  type IncidentTypeGroup,
  type RootCause,
} from './incident-catalog';
import { excerpt } from './remedy-core';
import { readQueueAudit, writeQueueAudit, type QueueActor, type QueueAuditEntry } from './audit';
import type { AssigneeDirectory } from './assignees';
import { DAY_MS } from './time';
import { notifyAssignment } from './notify';
import type { IncidentDetail, IncidentItem, IncidentListResponse, IncidentSummary, TimelineEntryDto } from './types';

export const INCIDENT_VIEWS = ['open', 'mine', 'table', 'resolved'] as const;
export type IncidentView = (typeof INCIDENT_VIEWS)[number];

export function normalizeIncidentView(v: unknown): IncidentView {
  return typeof v === 'string' && (INCIDENT_VIEWS as readonly string[]).includes(v) ? (v as IncidentView) : 'open';
}

const TABLE_TYPES = typesOfGroup('table');
const KNOWN_TYPES = INCIDENT_TYPES.map((t) => t.code);

const LIST_SELECT = {
  id: true,
  type: true,
  severity: true,
  status: true,
  title: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  dueAt: true,
  resolvedAt: true,
  assignedToId: true,
  thresholdValue: true,
  metadata: true,
  assignedTo: { select: { name: true } },
} satisfies Prisma.IncidentSelect;

type IncidentRow = Prisma.IncidentGetPayload<{ select: typeof LIST_SELECT }>;

function descriptionExcerpt(description: string | null): string | null {
  if (!description) return null;
  // İlk anlamlı satır (masa sinyali açıklaması satır satır gelir).
  const first = description.split(/\r?\n/).find((l) => l.trim().length > 0) ?? description;
  return excerpt(first, 160);
}

function toItem(row: IncidentRow, dir: AssigneeDirectory, now: Date): IncidentItem {
  const def = incidentTypeDef(row.type);
  const meta = readIncidentMeta(row.metadata);
  const status = toIncidentStatus(row.status);
  return {
    id: row.id,
    type: row.type,
    typeGroup: def.group,
    severity: toIncidentSeverity(row.severity),
    status,
    title: row.title,
    excerpt: descriptionExcerpt(row.description),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    overdue: isIncidentOverdue(status, row.dueAt, now),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    assignee: dir.get(row.assignedToId, row.assignedTo?.name),
    source: sourceOfGroup(def.group),
    table: meta.table,
    feedbackCount: meta.feedbackIds.length,
  };
}

export interface IncidentListParams {
  view: IncidentView;
  severity: IncidentSeverity | 'all';
  group: IncidentTypeGroup | 'all';
  q: string;
  page: number;
  pageSize: number;
}

function listWhere(dealerId: string, actorId: string, p: IncidentListParams): Prisma.IncidentWhereInput {
  const and: Prisma.IncidentWhereInput[] = [{ dealerId }];
  if (p.view === 'resolved') and.push({ status: 'resolved' });
  else and.push({ status: { in: [...OPEN_INCIDENT_STATUSES] } });
  if (p.view === 'mine') and.push({ assignedToId: actorId });
  if (p.view === 'table') and.push({ type: { in: TABLE_TYPES } });
  if (p.severity !== 'all') and.push({ severity: p.severity });
  if (p.group !== 'all') {
    const codes = typesOfGroup(p.group);
    and.push(p.group === 'manual' ? { OR: [{ type: { in: codes } }, { type: { notIn: KNOWN_TYPES } }] } : { type: { in: codes } });
  }
  if (p.q) {
    const contains = { contains: p.q, mode: 'insensitive' as const };
    and.push({ OR: [{ title: contains }, { description: contains }] });
  }
  return { AND: and };
}

const OPEN_ORDER: Prisma.IncidentOrderByWithRelationInput[] = [
  { dueAt: { sort: 'asc', nulls: 'last' } },
  { createdAt: 'desc' },
  { id: 'desc' },
];

/**
 * Açık vakalar önem sırasıyla sayfalanır: önem kodu dizgi olduğu için SQL'de doğrudan
 * sıralanamaz → önce önem başına sayım, sonra sayfanın düştüğü önem kovalarından okuma.
 */
async function pageBySeverity(where: Prisma.IncidentWhereInput, skip: number, take: number): Promise<{ rows: IncidentRow[]; total: number }> {
  const grouped = await prisma.incident.groupBy({ by: ['severity'], where, _count: { _all: true } });
  const known = INCIDENT_SEVERITIES as readonly string[];
  const buckets: Array<{ filter: Prisma.IncidentWhereInput; count: number }> = INCIDENT_SEVERITIES.map((s) => ({
    filter: { severity: s },
    count: grouped.find((g) => g.severity === s)?._count._all ?? 0,
  }));
  const otherCount = grouped.filter((g) => !known.includes(g.severity)).reduce((n, g) => n + g._count._all, 0);
  if (otherCount > 0) buckets.push({ filter: { severity: { notIn: [...known] } }, count: otherCount });

  const total = buckets.reduce((n, b) => n + b.count, 0);
  const rows: IncidentRow[] = [];
  let offset = skip;
  let remaining = take;
  for (const b of buckets) {
    if (remaining <= 0) break;
    if (offset >= b.count) {
      offset -= b.count;
      continue;
    }
    const n = Math.min(remaining, b.count - offset);
    const part = await prisma.incident.findMany({
      where: { AND: [where, b.filter] },
      orderBy: OPEN_ORDER,
      skip: offset,
      take: n,
      select: LIST_SELECT,
    });
    rows.push(...part);
    remaining -= part.length;
    offset = 0;
  }
  return { rows, total };
}

export async function listIncidents(
  dealerId: string,
  actorId: string,
  params: IncidentListParams,
  dir: AssigneeDirectory,
  now: Date = new Date()
): Promise<Omit<IncidentListResponse, 'summary'>> {
  const where = listWhere(dealerId, actorId, params);
  const skip = (params.page - 1) * params.pageSize;
  let rows: IncidentRow[];
  let total: number;
  if (params.view === 'resolved') {
    [rows, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: [{ resolvedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: params.pageSize,
        select: LIST_SELECT,
      }),
      prisma.incident.count({ where }),
    ]);
  } else {
    ({ rows, total } = await pageBySeverity(where, skip, params.pageSize));
  }
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  return {
    items: rows.map((r) => toItem(r, dir, now)),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages,
  };
}

export async function getIncidentSummary(dealerId: string, actorId: string, now: Date = new Date()): Promise<IncidentSummary> {
  const open: Prisma.IncidentWhereInput = { dealerId, status: { in: [...OPEN_INCIDENT_STATUSES] } };
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const [openCount, urgent, overdue, mine, table, resolved7d, resolvedRows] = await Promise.all([
    prisma.incident.count({ where: open }),
    prisma.incident.count({ where: { ...open, severity: { in: ['critical', 'high'] } } }),
    prisma.incident.count({ where: { ...open, dueAt: { lt: now } } }),
    prisma.incident.count({ where: { ...open, assignedToId: actorId } }),
    prisma.incident.count({ where: { ...open, type: { in: TABLE_TYPES } } }),
    prisma.incident.count({ where: { dealerId, status: 'resolved', resolvedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } } }),
    prisma.incident.findMany({
      where: { dealerId, status: 'resolved', resolvedAt: { gte: since30 } },
      select: { createdAt: true, resolvedAt: true },
      orderBy: { resolvedAt: 'desc' },
      take: 1000,
    }),
  ]);
  const durations = resolvedRows
    .map((r) => (r.resolvedAt ? (r.resolvedAt.getTime() - r.createdAt.getTime()) / 1000 : null))
    .filter((d): d is number => d != null && d >= 0);
  return {
    open: openCount,
    urgent,
    overdue,
    mine,
    table,
    resolved7d,
    mttrSeconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    mttrSample: durations.length,
  };
}

/* ───────────────────────── Detay ───────────────────────── */

async function loadOwned(dealerId: string, id: string): Promise<IncidentRow> {
  const row = await prisma.incident.findFirst({ where: { id, dealerId }, select: LIST_SELECT });
  if (!row) throw new ApiError('NOT_FOUND', 'Vaka bulunamadı.');
  return row;
}

function auditToTimeline(
  rows: Awaited<ReturnType<typeof readQueueAudit>>,
  dir: AssigneeDirectory
): TimelineEntryDto[] {
  return rows.map((r) => {
    const d = r.data;
    const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : null);
    let label = r.action;
    const params: Record<string, string | null> = {};
    switch (r.action) {
      case 'incident.created':
        label = 'Vaka açıldı';
        params.source = str('source');
        break;
      case 'incident.status':
        label = 'Durum değişti';
        params.from = str('from');
        params.to = str('to');
        break;
      case 'incident.assigned': {
        label = 'Sorumlu değişti';
        const to = str('to');
        params.toName = to ? (dir.get(to)?.name ?? null) : null;
        break;
      }
      case 'incident.severity':
        label = 'Önem değişti';
        params.from = str('from');
        params.to = str('to');
        break;
      case 'incident.due':
        label = 'Son tarih değişti';
        params.to = str('to');
        break;
      case 'incident.note':
        label = 'Not eklendi';
        break;
      case 'incident.resolved':
        label = 'Çözüldü';
        params.rootCause = str('rootCause');
        break;
      case 'incident.task':
        label = 'Görev oluşturuldu';
        params.taskId = str('taskId');
        break;
      default:
        break;
    }
    return {
      id: r.id,
      at: r.createdAt.toISOString(),
      kind: r.action,
      label,
      actorName: r.actorType === 'system' ? null : r.actorName,
      note: str('note'),
      params,
    };
  });
}

export async function getIncidentDetail(
  dealerId: string,
  id: string,
  dir: AssigneeDirectory,
  now: Date = new Date()
): Promise<IncidentDetail> {
  const row = await loadOwned(dealerId, id);
  const meta = readIncidentMeta(row.metadata);
  const [feedbacks, tasks, audit] = await Promise.all([
    meta.feedbackIds.length
      ? prisma.feedback.findMany({
          // Kiracı güvenliği: metadata'daki kimlikler yine bu bayinin QR'larıyla süzülür.
          where: { id: { in: meta.feedbackIds }, deletedAt: null, qrCode: { dealerId } },
          select: { id: true, rating: true, text: true, createdAt: true, dealerRepliedAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
    meta.taskIds.length
      ? prisma.actionItem.findMany({
          where: { id: { in: meta.taskIds }, dealerId },
          select: { id: true, suggestionText: true, status: true },
          take: 20,
        })
      : Promise.resolve([]),
    readQueueAudit('Incident', id),
  ]);

  const item = toItem(row, dir, now);
  const timeline = auditToTimeline(audit, dir);
  if (!audit.some((a) => a.action === 'incident.created')) {
    // Eski vakalar (denetim izinden önce açılmış): açılış anı kayıttan.
    timeline.unshift({
      id: `${row.id}:created`,
      at: row.createdAt.toISOString(),
      kind: 'incident.created',
      label: 'Vaka açıldı',
      actorName: null,
      note: null,
      params: { source: meta.source },
    });
  }

  return {
    ...item,
    description: row.description,
    thresholdValue: row.thresholdValue,
    metrics: meta.metrics,
    note: meta.note,
    resolution: item.status === 'resolved' ? meta.resolution : null,
    feedbacks: feedbacks.map((f) => ({
      id: f.id,
      rating: f.rating,
      excerpt: excerpt(f.text, 200),
      createdAt: f.createdAt.toISOString(),
      replied: Boolean(f.dealerRepliedAt),
      href: `/dealer/inbox?id=qr-${f.id}`,
    })),
    tasks: tasks.map((t) => ({ id: t.id, title: excerpt(t.suggestionText, 120) ?? '', status: t.status })),
    timeline,
    allowedTransitions: allowedIncidentTransitions(item.status, Boolean(row.assignedToId)),
  };
}

/* ───────────────────────── Yazma ───────────────────────── */

export interface CreateIncidentInput {
  type: string;
  severity: IncidentSeverity;
  title: string;
  description?: string | null;
  assignedToId?: string | null;
  dueAt?: Date | null;
}

function cleanText(v: string | null | undefined, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[ \t]+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

export async function createManualIncident(
  dealerId: string,
  actor: QueueActor,
  input: CreateIncidentInput,
  dir: AssigneeDirectory,
  now: Date = new Date()
): Promise<IncidentDetail> {
  const def = incidentTypeDef(input.type);
  if (!def.manual) throw new ApiError('VALIDATION', 'Geçersiz vaka türü.');
  const title = cleanText(input.title, 140);
  if (!title || title.length < 3) throw new ApiError('VALIDATION', 'Başlık en az 3 karakter olmalı.');
  const assignee = await validateAssignee(dealerId, input.assignedToId);
  if (!assignee.ok) throw new ApiError('VALIDATION', assignee.error);
  const assignedToId = assignee.value ?? null;

  const created = await prisma.$transaction(async (tx) => {
    const incident = await tx.incident.create({
      data: {
        dealerId,
        type: def.code,
        severity: input.severity,
        status: assignedToId ? 'assigned' : 'open',
        title,
        description: cleanText(input.description ?? null, 4000),
        assignedToId,
        dueAt: input.dueAt ?? defaultDueAt(input.severity, now),
        metadata: { source: 'manual', createdBy: actor.id } as Prisma.InputJsonValue,
      },
      select: { id: true, title: true },
    });
    const entries: QueueAuditEntry[] = [
      { action: 'incident.created', entity: 'Incident', entityId: incident.id, data: { source: 'manual' } },
    ];
    if (assignedToId) entries.push({ action: 'incident.assigned', entity: 'Incident', entityId: incident.id, data: { from: null, to: assignedToId } });
    await writeQueueAudit(tx, actor, entries);
    if (assignedToId) {
      await notifyAssignment(tx, { dealerId, assigneeId: assignedToId, actor, kind: 'incident', entityId: incident.id, title: incident.title });
    }
    return incident;
  });
  return getIncidentDetail(dealerId, created.id, dir, now);
}

export interface UpdateIncidentInput {
  status?: IncidentPatch['status'];
  assignedToId?: string | null;
  severity?: IncidentSeverity;
  dueAt?: Date | null;
  resolutionNote?: string | null;
  rootCause?: RootCause | null;
  /** Zaman çizelgesine iç not ekle. */
  note?: string | null;
}

function eventEntries(id: string, events: IncidentEvent[], resolutionNote: string | null, rootCause: string | null): QueueAuditEntry[] {
  const out: QueueAuditEntry[] = [];
  for (const e of events) {
    if (e.kind === 'status') {
      if (e.to === 'resolved') {
        out.push({ action: 'incident.resolved', entity: 'Incident', entityId: id, data: { from: e.from, note: resolutionNote, rootCause } });
      } else {
        out.push({ action: 'incident.status', entity: 'Incident', entityId: id, data: { from: e.from, to: e.to } });
      }
    } else if (e.kind === 'assigned') {
      out.push({ action: 'incident.assigned', entity: 'Incident', entityId: id, data: { from: e.from, to: e.to } });
    } else if (e.kind === 'severity') {
      out.push({ action: 'incident.severity', entity: 'Incident', entityId: id, data: { from: e.from, to: e.to } });
    } else if (e.kind === 'due') {
      out.push({ action: 'incident.due', entity: 'Incident', entityId: id, data: { from: e.from, to: e.to } });
    }
  }
  return out;
}

function mergeMeta(metadata: unknown, patch: Record<string, unknown>): Prisma.InputJsonValue {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  const next: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return next as Prisma.InputJsonValue;
}

/** Masa sinyali vakası çözülünce bağlı TablePulse'ı kapatır (idempotent). */
async function syncTablePulse(metadata: unknown, resolvedAt: Date): Promise<void> {
  const m = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  const pulseId = typeof m.tablePulseId === 'string' && m.tablePulseId ? m.tablePulseId : null;
  if (!pulseId) return;
  await prisma.tablePulse.updateMany({ where: { id: pulseId, resolvedAt: null }, data: { resolvedAt } });
}

export async function updateIncident(
  dealerId: string,
  actor: QueueActor,
  id: string,
  input: UpdateIncidentInput,
  dir: AssigneeDirectory,
  now: Date = new Date()
): Promise<IncidentDetail> {
  let assigneeValue: string | null | undefined = undefined;
  if (input.assignedToId !== undefined) {
    const v = await validateAssignee(dealerId, input.assignedToId);
    if (!v.ok) throw new ApiError('VALIDATION', v.error);
    assigneeValue = v.value ?? null;
  }
  const resolutionNote = cleanText(input.resolutionNote ?? null, 1000);
  const note = cleanText(input.note ?? null, 1000);

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`incident:${id}`}))`;
    const row = await tx.incident.findFirst({
      where: { id, dealerId },
      select: { id: true, type: true, title: true, status: true, severity: true, assignedToId: true, dueAt: true, resolvedAt: true, metadata: true },
    });
    if (!row) throw new ApiError('NOT_FOUND', 'Vaka bulunamadı.');

    // Personel yalnız kendine atanmış (ya da sahipsiz olanı üstlenerek) vakayı ilerletir.
    if (actor.role === 'STAFF') {
      const ownsIt = row.assignedToId === actor.id || (row.assignedToId === null && assigneeValue === actor.id);
      if (!ownsIt) throw new ApiError('FORBIDDEN', 'Yalnız size atanmış vakayı güncelleyebilirsiniz.');
      if (assigneeValue !== undefined && assigneeValue !== actor.id) {
        throw new ApiError('FORBIDDEN', 'Vakayı başka birine yalnız işletme sahibi atayabilir.');
      }
    }

    const res = applyIncidentPatch(
      {
        type: row.type,
        status: toIncidentStatus(row.status),
        severity: toIncidentSeverity(row.severity),
        assignedToId: row.assignedToId,
        dueAt: row.dueAt,
        resolvedAt: row.resolvedAt,
      },
      {
        status: input.status,
        assignedToId: assigneeValue,
        severity: input.severity,
        dueAt: input.dueAt,
        resolutionNote,
        rootCause: input.rootCause ?? null,
      },
      now
    );
    if (!res.ok) {
      throw new ApiError(res.code, res.message, { status: res.code === 'INVALID_TRANSITION' ? 409 : 400 });
    }

    const resolvedNow = res.next.status === 'resolved' && row.status !== 'resolved';
    const reopened = row.status === 'resolved' && res.next.status !== 'resolved';
    const entries = eventEntries(id, res.events, resolutionNote, input.rootCause ?? null);
    if (note) entries.push({ action: 'incident.note', entity: 'Incident', entityId: id, data: { note } });
    if (entries.length === 0) return { row, next: res.next, changed: false, resolvedNow: false };

    await tx.incident.update({
      where: { id },
      data: {
        status: res.next.status,
        severity: res.next.severity,
        assignedToId: res.next.assignedToId,
        dueAt: res.next.dueAt,
        resolvedAt: res.next.resolvedAt,
        ...(resolvedNow || reopened
          ? {
              metadata: mergeMeta(row.metadata, {
                resolution: resolvedNow
                  ? { note: resolutionNote, rootCause: input.rootCause ?? null, by: actor.name ?? null, at: now.toISOString() }
                  : null,
              }),
            }
          : {}),
      },
    });
    await writeQueueAudit(tx, actor, entries);
    if (res.next.assignedToId && res.next.assignedToId !== row.assignedToId) {
      await notifyAssignment(tx, { dealerId, assigneeId: res.next.assignedToId, actor, kind: 'incident', entityId: id, title: row.title });
    }
    return { row, next: res.next, changed: true, resolvedNow };
  });

  if (outcome.resolvedNow && outcome.next.resolvedAt) {
    await syncTablePulse(outcome.row.metadata, outcome.next.resolvedAt).catch((err) =>
      console.error('[incidents] masa sinyali kapatılamadı:', err)
    );
  }
  return getIncidentDetail(dealerId, id, dir, now);
}

const SEVERITY_TO_PRIORITY: Record<IncidentSeverity, 'high' | 'medium' | 'low'> = {
  critical: 'high',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

/** Vakadan görev üretir (ActionItem `sourceModule: 'incident'`) ve vakaya bağlar. */
export async function createTaskFromIncident(
  dealerId: string,
  actor: QueueActor,
  id: string,
  input: { text?: string | null; assignedToId?: string | null; dueAt?: Date | null },
  dir: AssigneeDirectory,
  now: Date = new Date()
): Promise<IncidentDetail> {
  const assignee = await validateAssignee(dealerId, input.assignedToId);
  if (!assignee.ok) throw new ApiError('VALIDATION', assignee.error);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`incident:${id}`}))`;
    const row = await tx.incident.findFirst({ where: { id, dealerId }, select: { id: true, title: true, severity: true, metadata: true } });
    if (!row) throw new ApiError('NOT_FOUND', 'Vaka bulunamadı.');
    const meta = readIncidentMeta(row.metadata);
    if (meta.taskIds.length >= 20) throw new ApiError('CONFLICT', 'Bu vakaya bağlı görev sınırına ulaşıldı.');
    // İlk kanıt yorum (varsa ve bu bayiye aitse) göreve bağlanır.
    let feedbackId: string | null = null;
    if (meta.feedbackIds.length) {
      const fb = await tx.feedback.findFirst({ where: { id: { in: meta.feedbackIds }, qrCode: { dealerId } }, select: { id: true } });
      feedbackId = fb?.id ?? null;
    }
    const text = cleanText(input.text ?? null, 1000) ?? row.title;
    const assignedToId = assignee.value ?? null;
    const task = await tx.actionItem.create({
      data: {
        dealerId,
        feedbackId,
        suggestionText: text,
        priority: SEVERITY_TO_PRIORITY[toIncidentSeverity(row.severity)],
        status: assignedToId ? 'assigned' : 'pending',
        assignedToId,
        dueAt: input.dueAt ?? null,
        sourceModule: 'incident',
      },
      select: { id: true },
    });
    await tx.incident.update({
      where: { id },
      data: { metadata: mergeMeta(row.metadata, { taskIds: [...meta.taskIds, task.id] }) },
    });
    await writeQueueAudit(tx, actor, [
      { action: 'incident.task', entity: 'Incident', entityId: id, data: { taskId: task.id } },
      { action: 'task.created', entity: 'ActionItem', entityId: task.id, data: { source: 'incident', incidentId: id } },
      ...(assignedToId ? [{ action: 'task.assigned', entity: 'ActionItem' as const, entityId: task.id, data: { from: null, to: assignedToId } }] : []),
    ]);
    if (assignedToId) {
      await notifyAssignment(tx, { dealerId, assigneeId: assignedToId, actor, kind: 'task', entityId: task.id, title: text });
    }
  });
  return getIncidentDetail(dealerId, id, dir, now);
}
