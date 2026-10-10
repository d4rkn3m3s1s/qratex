/**
 * "Bana atananlar" — görev (ActionItem) + vaka (Incident) birleşik iş kuyruğu (sunucu).
 *
 * Kapanan denetim bulguları (dealer_action-items.md):
 *  - 1/2/3: liste GET'i artık YAN ETKİSİZ (eski `runActionItemsAutoTrigger` LLM + N+1 + yarış
 *    üreten okuma yolundan çıkarıldı). AI önerileri "Öneriler" bandında salt okunur gösterilir
 *    (yorum analizindeki `actionSuggestions`, kanıt sayısıyla birleştirilmiş); görev yalnız
 *    bayi "Göreve çevir" dediğinde oluşur → KPI'lar gerçek işi ölçer.
 *  - 4 / P0-11: atanan kişi yalnız bayinin kendisi ya da AKTİF personeli; e-posta dönmez.
 *  - 6: personel (STAFF) kendine atanan işi bu uçlardan görür ve ilerletir (personel paneli
 *    tüketir); başkasına atayamaz.
 *  - 7: durum makinesi sunucuda (`applyTaskPatch`); `completedAt` sunucu saati; iptal ve
 *    yeniden açma; her geçiş `AuditLog`'a yazılır.
 *  - 8: öneriler normalize metne göre birleştirilir (aynı öneri N yorumdan → tek satır, N kanıt);
 *    olumlu yorumların önerileri iş üretmez.
 *  - 10: sıralama geciken → öncelik → son tarih → yeni.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { validateAssignee } from '@/lib/dealer/assignee';
import {
  OPEN_INCIDENT_STATUSES,
  incidentTypeDef,
  isIncidentOverdue,
  toIncidentSeverity,
} from './incident-catalog';
import {
  OPEN_TASK_STATUSES,
  OPEN_WORK_CAP,
  SUGGESTION_LIMIT,
  SUGGESTION_LOOKBACK_DAYS,
  TASK_TEXT_MAX,
  allowedTaskTransitions,
  applyTaskPatch,
  compareClosedWork,
  compareOpenWork,
  isTaskOverdue,
  normalizeSuggestionText,
  suggestionKey,
  toTaskPriority,
  toTaskRawStatus,
  workStatusOfIncident,
  workStatusOfTask,
  type TaskPatch,
  type TaskPriority,
  type WorkKindFilter,
  type WorkPriority,
  type WorkScope,
} from './work-core';
import { excerpt } from './remedy-core';
import { readQueueAudit, writeQueueAudit, type QueueActor, type QueueAuditEntry } from './audit';
import { notifyAssignment } from './notify';
import type { AssigneeDirectory } from './assignees';
import { DAY_MS, istanbulWeekStart } from './time';
import type { TaskDetail, TaskSuggestion, TimelineEntryDto, WorkItem, WorkListResponse, WorkSummary } from './types';

/* ───────────────────────── Eşleme ───────────────────────── */

const TASK_SELECT = {
  id: true,
  feedbackId: true,
  suggestionText: true,
  priority: true,
  status: true,
  assignedToId: true,
  dueAt: true,
  completedAt: true,
  sourceModule: true,
  impactScore: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { name: true } },
} satisfies Prisma.ActionItemSelect;
type TaskRow = Prisma.ActionItemGetPayload<{ select: typeof TASK_SELECT }>;

const INCIDENT_SELECT = {
  id: true,
  type: true,
  severity: true,
  status: true,
  title: true,
  description: true,
  assignedToId: true,
  dueAt: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { name: true } },
} satisfies Prisma.IncidentSelect;
type IncidentRow = Prisma.IncidentGetPayload<{ select: typeof INCIDENT_SELECT }>;

export const TASK_SOURCE_LABELS: Record<string, string> = {
  feedback: 'Geri bildirimden',
  ai_aggregate: 'İşletme analizinden',
  agent_council: 'Danışman önerisi',
  incident: 'Vakadan',
  manual: 'Elle eklendi',
};

/** "[Agent Council] Başlık\n\nGövde" gibi kayıtları başlık + özet olarak ayırır. */
export function splitTaskText(text: string): { title: string; rest: string | null } {
  const cleaned = text.replace(/^\s*\[[^\]]{1,40}\]\s*/, '').trim();
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title = excerpt(lines[0] ?? cleaned, 140) ?? '';
  const rest = lines.length > 1 ? excerpt(lines.slice(1).join(' '), 180) : null;
  return { title, rest };
}

function taskToWork(row: TaskRow, dir: AssigneeDirectory, now: Date): WorkItem {
  const status = workStatusOfTask(row.status);
  const { title, rest } = splitTaskText(row.suggestionText);
  const sourceKind = row.sourceModule ?? (row.feedbackId ? 'feedback' : 'manual');
  return {
    key: `task-${row.id}`,
    kind: 'task',
    id: row.id,
    title,
    excerpt: rest,
    priority: toTaskPriority(row.priority),
    status,
    rawStatus: row.status,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    overdue: isTaskOverdue(status, row.dueAt, now),
    createdAt: row.createdAt.toISOString(),
    closedAt:
      status === 'done' ? (row.completedAt ?? row.updatedAt).toISOString() : status === 'cancelled' ? row.updatedAt.toISOString() : null,
    assignee: dir.get(row.assignedToId, row.assignedTo?.name),
    sourceLabel: TASK_SOURCE_LABELS[sourceKind] ?? 'Görev',
    sourceKind,
    feedbackHref: row.feedbackId ? `/dealer/inbox?id=qr-${row.feedbackId}` : null,
    impactScore: typeof row.impactScore === 'number' ? Math.round(row.impactScore) : null,
  };
}

function incidentToWork(row: IncidentRow, dir: AssigneeDirectory, now: Date): WorkItem {
  const def = incidentTypeDef(row.type);
  const status = workStatusOfIncident(row.status);
  return {
    key: `incident-${row.id}`,
    kind: 'incident',
    id: row.id,
    title: excerpt(row.title, 140) ?? row.title,
    excerpt: excerpt(row.description?.split(/\r?\n/).find((l) => l.trim()) ?? null, 180),
    priority: toIncidentSeverity(row.severity) as WorkPriority,
    status,
    rawStatus: row.status,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    overdue: isIncidentOverdue(row.status, row.dueAt, now),
    createdAt: row.createdAt.toISOString(),
    closedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    assignee: dir.get(row.assignedToId, row.assignedTo?.name),
    sourceLabel: `Vaka · ${def.label.tr}`,
    sourceKind: `incident:${def.group}`,
    feedbackHref: null,
    impactScore: null,
  };
}

/* ───────────────────────── Liste ───────────────────────── */

export interface WorkListParams {
  scope: WorkScope;
  kind: WorkKindFilter;
  q: string;
  offset: number;
  limit: number;
}

type AssigneeClause = { assignedToId: string | null | { not: string | null } };

/** Kapsam → sorumlu koşulları (görev ve vaka için aynı). Personel yalnız kendi işini görür. */
function assigneeClauses(scope: WorkScope, actor: QueueActor): AssigneeClause[] {
  const me = actor.id ?? '__none__';
  if (actor.role === 'STAFF' || scope === 'mine') return [{ assignedToId: me }];
  if (scope === 'unassigned') return [{ assignedToId: null }];
  if (scope === 'team') return [{ assignedToId: { not: null } }, { assignedToId: { not: me } }];
  return [];
}

function closedSince(now: Date): Date {
  return new Date(now.getTime() - 30 * DAY_MS);
}

function taskWhere(dealerId: string, actor: QueueActor, p: WorkListParams, now: Date): Prisma.ActionItemWhereInput {
  const and: Prisma.ActionItemWhereInput[] = [{ dealerId }, ...assigneeClauses(p.scope, actor)];
  if (p.scope === 'closed') and.push({ status: { in: ['done', 'cancelled'] }, updatedAt: { gte: closedSince(now) } });
  else and.push({ status: { in: [...OPEN_TASK_STATUSES] } });
  if (p.q) and.push({ suggestionText: { contains: p.q, mode: 'insensitive' } });
  return { AND: and };
}

function incidentWhere(dealerId: string, actor: QueueActor, p: WorkListParams, now: Date): Prisma.IncidentWhereInput {
  const and: Prisma.IncidentWhereInput[] = [{ dealerId }, ...assigneeClauses(p.scope, actor)];
  if (p.scope === 'closed') and.push({ status: 'resolved', resolvedAt: { gte: closedSince(now) } });
  else and.push({ status: { in: [...OPEN_INCIDENT_STATUSES] } });
  if (p.q) {
    const contains = { contains: p.q, mode: 'insensitive' as const };
    and.push({ OR: [{ title: contains }, { description: contains }] });
  }
  return { AND: and };
}

export async function listWork(
  dealerId: string,
  actor: QueueActor,
  params: WorkListParams,
  dir: AssigneeDirectory,
  opts: { incidentsEnabled: boolean; tasksEnabled?: boolean },
  now: Date = new Date()
): Promise<Omit<WorkListResponse, 'summary'>> {
  const wantTasks = (opts.tasksEnabled ?? true) && params.kind !== 'incident';
  const wantIncidents = opts.incidentsEnabled && params.kind !== 'task';
  const closed = params.scope === 'closed';
  const fetchN = closed ? params.offset + params.limit : OPEN_WORK_CAP;
  const tWhere = taskWhere(dealerId, actor, params, now);
  const iWhere = incidentWhere(dealerId, actor, params, now);

  const [tasks, incidents, taskCount, incidentCount] = await Promise.all([
    wantTasks
      ? prisma.actionItem.findMany({
          where: tWhere,
          orderBy: closed ? [{ updatedAt: 'desc' }, { id: 'desc' }] : [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
          take: fetchN,
          select: TASK_SELECT,
        })
      : Promise.resolve([] as TaskRow[]),
    wantIncidents
      ? prisma.incident.findMany({
          where: iWhere,
          orderBy: closed ? [{ resolvedAt: 'desc' }, { id: 'desc' }] : [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
          take: fetchN,
          select: INCIDENT_SELECT,
        })
      : Promise.resolve([] as IncidentRow[]),
    wantTasks ? prisma.actionItem.count({ where: tWhere }) : Promise.resolve(0),
    wantIncidents ? prisma.incident.count({ where: iWhere }) : Promise.resolve(0),
  ]);

  const merged = [...tasks.map((t) => taskToWork(t, dir, now)), ...incidents.map((i) => incidentToWork(i, dir, now))];
  merged.sort(closed ? compareClosedWork : compareOpenWork);
  const items = merged.slice(params.offset, params.offset + params.limit);
  const total = taskCount + incidentCount;
  const reachable = Math.min(total, closed ? total : merged.length);
  const nextOffset = params.offset + items.length < reachable ? params.offset + items.length : null;
  return { items, nextOffset, total, incidentsIncluded: wantIncidents };
}

export async function getWorkSummary(
  dealerId: string,
  actor: QueueActor,
  opts: { incidentsEnabled: boolean },
  now: Date = new Date()
): Promise<WorkSummary> {
  const weekStart = istanbulWeekStart(now);
  const me = actor.id ?? '__none__';
  const [taskGroups, incGroups, taskOverdue, incOverdue, tasksDone, incResolved] = await Promise.all([
    prisma.actionItem.groupBy({
      by: ['assignedToId'],
      where: { dealerId, status: { in: [...OPEN_TASK_STATUSES] } },
      _count: { _all: true },
    }),
    opts.incidentsEnabled
      ? prisma.incident.groupBy({
          by: ['assignedToId'],
          where: { dealerId, status: { in: [...OPEN_INCIDENT_STATUSES] } },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ assignedToId: string | null; _count: { _all: number } }>),
    prisma.actionItem.count({ where: { dealerId, assignedToId: me, status: { in: [...OPEN_TASK_STATUSES] }, dueAt: { lt: now } } }),
    opts.incidentsEnabled
      ? prisma.incident.count({ where: { dealerId, assignedToId: me, status: { in: [...OPEN_INCIDENT_STATUSES] }, dueAt: { lt: now } } })
      : Promise.resolve(0),
    prisma.actionItem.count({
      where: { dealerId, status: 'done', completedAt: { gte: weekStart }, ...(actor.role === 'STAFF' ? { assignedToId: me } : {}) },
    }),
    opts.incidentsEnabled
      ? prisma.incident.count({
          where: { dealerId, status: 'resolved', resolvedAt: { gte: weekStart }, ...(actor.role === 'STAFF' ? { assignedToId: me } : {}) },
        })
      : Promise.resolve(0),
  ]);
  let mine = 0;
  let team = 0;
  let unassigned = 0;
  for (const g of [...taskGroups, ...incGroups]) {
    if (g.assignedToId === null) unassigned += g._count._all;
    else if (g.assignedToId === me) mine += g._count._all;
    else team += g._count._all;
  }
  return {
    mine,
    mineOverdue: taskOverdue + incOverdue,
    team: actor.role === 'STAFF' ? 0 : team,
    unassigned: actor.role === 'STAFF' ? 0 : unassigned,
    closedThisWeek: tasksDone + incResolved,
  };
}

/* ───────────────────────── Görev detayı ve yazma ───────────────────────── */

const TASK_ACTION_LABELS: Record<string, string> = {
  'task.created': 'Görev oluşturuldu',
  'task.status': 'Durum değişti',
  'task.assigned': 'Sorumlu değişti',
  'task.priority': 'Öncelik değişti',
  'task.due': 'Son tarih değişti',
  'task.note': 'Not eklendi',
};

async function loadTask(dealerId: string, id: string) {
  const row = await prisma.actionItem.findFirst({
    where: { id, dealerId },
    select: { ...TASK_SELECT, feedback: { select: { id: true, rating: true, text: true, createdAt: true, deletedAt: true } } },
  });
  if (!row) throw new ApiError('NOT_FOUND', 'Görev bulunamadı.');
  return row;
}

function assertStaffAccess(actor: QueueActor, assignedToId: string | null): void {
  if (actor.role === 'STAFF' && assignedToId !== actor.id) {
    throw new ApiError('FORBIDDEN', 'Yalnız size atanmış görevi görüntüleyip güncelleyebilirsiniz.');
  }
}

export async function getTaskDetail(
  dealerId: string,
  actor: QueueActor,
  id: string,
  dir: AssigneeDirectory,
  now: Date = new Date()
): Promise<TaskDetail> {
  const row = await loadTask(dealerId, id);
  assertStaffAccess(actor, row.assignedToId);
  const audit = await readQueueAudit('ActionItem', id);
  const work = taskToWork(row, dir, now);
  const timeline: TimelineEntryDto[] = audit.map((a) => {
    const d = a.data;
    const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : null);
    const params: Record<string, string | null> = {};
    if (a.action === 'task.status' || a.action === 'task.priority') {
      params.from = str('from');
      params.to = str('to');
    } else if (a.action === 'task.assigned') {
      const to = str('to');
      params.toName = to ? (dir.get(to)?.name ?? null) : null;
    } else if (a.action === 'task.due') {
      params.to = str('to');
    } else if (a.action === 'task.created') {
      params.source = str('source');
    }
    return {
      id: a.id,
      at: a.createdAt.toISOString(),
      kind: a.action,
      label: TASK_ACTION_LABELS[a.action] ?? a.action,
      actorName: a.actorType === 'system' ? null : a.actorName,
      note: str('note'),
      params,
    };
  });
  if (!audit.some((a) => a.action === 'task.created')) {
    timeline.unshift({
      id: `${id}:created`,
      at: row.createdAt.toISOString(),
      kind: 'task.created',
      label: TASK_ACTION_LABELS['task.created'],
      actorName: null,
      note: null,
      params: { source: work.sourceKind },
    });
  }
  if (row.status === 'done' && row.completedAt && !audit.some((a) => a.action === 'task.status')) {
    timeline.push({
      id: `${id}:done`,
      at: row.completedAt.toISOString(),
      kind: 'task.status',
      label: TASK_ACTION_LABELS['task.status'],
      actorName: null,
      note: null,
      params: { from: null, to: 'done' },
    });
  }
  const fb = row.feedback && !row.feedback.deletedAt ? row.feedback : null;
  return {
    ...work,
    text: row.suggestionText.replace(/^\s*\[[^\]]{1,40}\]\s*/, '').trim(),
    feedback: fb
      ? { id: fb.id, rating: fb.rating, excerpt: excerpt(fb.text, 220), createdAt: fb.createdAt.toISOString(), href: `/dealer/inbox?id=qr-${fb.id}` }
      : null,
    timeline,
    allowedTransitions: allowedTaskTransitions(work.status),
  };
}

export interface CreateTaskInput {
  text: string;
  priority?: TaskPriority;
  assignedToId?: string | null;
  dueAt?: Date | null;
  feedbackId?: string | null;
}

function cleanTaskText(text: string): string {
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, TASK_TEXT_MAX);
}

export async function createTask(
  dealerId: string,
  actor: QueueActor,
  input: CreateTaskInput,
  dir: AssigneeDirectory,
  now: Date = new Date()
): Promise<TaskDetail> {
  if (actor.role === 'STAFF') throw new ApiError('FORBIDDEN', 'Görevi yalnız işletme sahibi oluşturabilir.');
  const text = cleanTaskText(input.text);
  if (text.length < 3) throw new ApiError('VALIDATION', 'Görev metni en az 3 karakter olmalı.');
  const assignee = await validateAssignee(dealerId, input.assignedToId);
  if (!assignee.ok) throw new ApiError('VALIDATION', assignee.error);
  const assignedToId = assignee.value ?? null;

  let feedbackId: string | null = null;
  if (input.feedbackId) {
    const fb = await prisma.feedback.findFirst({ where: { id: input.feedbackId, deletedAt: null, qrCode: { dealerId } }, select: { id: true } });
    if (!fb) throw new ApiError('NOT_FOUND', 'Bağlanacak geri bildirim bulunamadı.');
    feedbackId = fb.id;
  }

  const key = normalizeSuggestionText(text);
  const id = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`task:${dealerId}:${suggestionKey(text)}`}))`;
    const openSame = await tx.actionItem.findMany({
      where: { dealerId, status: { in: [...OPEN_TASK_STATUSES] }, suggestionText: { contains: text.slice(0, 40), mode: 'insensitive' } },
      select: { id: true, suggestionText: true },
      take: 20,
    });
    if (openSame.some((r) => normalizeSuggestionText(r.suggestionText) === key)) {
      throw new ApiError('CONFLICT', 'Bu iş için açık bir görev zaten var.');
    }
    const task = await tx.actionItem.create({
      data: {
        dealerId,
        feedbackId,
        suggestionText: text,
        priority: input.priority ?? 'medium',
        status: assignedToId ? 'assigned' : 'pending',
        assignedToId,
        dueAt: input.dueAt ?? null,
        sourceModule: feedbackId ? 'feedback' : 'manual',
      },
      select: { id: true },
    });
    const entries: QueueAuditEntry[] = [
      { action: 'task.created', entity: 'ActionItem', entityId: task.id, data: { source: feedbackId ? 'feedback' : 'manual' } },
    ];
    if (assignedToId) entries.push({ action: 'task.assigned', entity: 'ActionItem', entityId: task.id, data: { from: null, to: assignedToId } });
    await writeQueueAudit(tx, actor, entries);
    if (assignedToId) await notifyAssignment(tx, { dealerId, assigneeId: assignedToId, actor, kind: 'task', entityId: task.id, title: text });
    return task.id;
  });
  return getTaskDetail(dealerId, actor, id, dir, now);
}

export interface UpdateTaskInput extends TaskPatch {
  note?: string | null;
}

export async function updateTask(
  dealerId: string,
  actor: QueueActor,
  id: string,
  input: UpdateTaskInput,
  dir: AssigneeDirectory,
  now: Date = new Date()
): Promise<TaskDetail> {
  let assigneeValue: string | null | undefined = undefined;
  if (input.assignedToId !== undefined) {
    if (actor.role === 'STAFF') throw new ApiError('FORBIDDEN', 'Görevi yalnız işletme sahibi yeniden atayabilir.');
    const v = await validateAssignee(dealerId, input.assignedToId);
    if (!v.ok) throw new ApiError('VALIDATION', v.error);
    assigneeValue = v.value ?? null;
  }
  const note = typeof input.note === 'string' ? input.note.replace(/\s+/g, ' ').trim().slice(0, 1000) || null : null;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`task:${id}`}))`;
    const row = await tx.actionItem.findFirst({
      where: { id, dealerId },
      select: { id: true, status: true, assignedToId: true, dueAt: true, completedAt: true, priority: true, suggestionText: true },
    });
    if (!row) throw new ApiError('NOT_FOUND', 'Görev bulunamadı.');
    assertStaffAccess(actor, row.assignedToId);

    const res = applyTaskPatch(
      {
        status: toTaskRawStatus(row.status),
        assignedToId: row.assignedToId,
        dueAt: row.dueAt,
        completedAt: row.completedAt,
        priority: toTaskPriority(row.priority),
      },
      { status: input.status, assignedToId: assigneeValue, dueAt: input.dueAt, priority: input.priority },
      now
    );
    if (!res.ok) throw new ApiError(res.code, res.message, { status: 409 });

    const entries: QueueAuditEntry[] = res.events.map((e) => ({
      action: `task.${e.kind}`,
      entity: 'ActionItem' as const,
      entityId: id,
      data: { from: e.from, to: e.to },
    }));
    if (note) entries.push({ action: 'task.note', entity: 'ActionItem', entityId: id, data: { note } });
    if (entries.length === 0) return;

    if (res.changed) {
      const n = await tx.actionItem.updateMany({
        where: { id, dealerId },
        data: {
          status: res.next.status,
          assignedToId: res.next.assignedToId,
          dueAt: res.next.dueAt,
          completedAt: res.next.completedAt,
          priority: res.next.priority,
        },
      });
      if (n.count === 0) throw new ApiError('NOT_FOUND', 'Görev bulunamadı.');
    }
    await writeQueueAudit(tx, actor, entries);
    if (res.next.assignedToId && res.next.assignedToId !== row.assignedToId) {
      await notifyAssignment(tx, { dealerId, assigneeId: res.next.assignedToId, actor, kind: 'task', entityId: id, title: row.suggestionText });
    }
  });
  return getTaskDetail(dealerId, actor, id, dir, now);
}

/* ───────────────────────── Öneriler ───────────────────────── */

const DISMISSED_KEY = (dealerId: string) => `dealer_task_suggestions_dismissed:${dealerId}`;
const DISMISSED_MAX = 300;

async function readDismissed(dealerId: string): Promise<string[]> {
  const row = await prisma.settings.findUnique({ where: { key: DISMISSED_KEY(dealerId) }, select: { value: true } });
  const v = row?.value as { keys?: unknown } | null | undefined;
  return Array.isArray(v?.keys) ? (v.keys as unknown[]).filter((k): k is string => typeof k === 'string').slice(-DISMISSED_MAX) : [];
}

const PRIORITY_IN: Record<string, TaskPriority> = { high: 'high', medium: 'medium', low: 'low', critical: 'high', urgent: 'high' };

function parseSuggestions(raw: unknown): Array<{ text: string; priority: TaskPriority }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ text: string; priority: TaskPriority }> = [];
  for (const item of raw.slice(0, 8)) {
    if (typeof item === 'string') {
      const t = item.trim();
      if (t.length >= 4) out.push({ text: t.slice(0, 300), priority: 'medium' });
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      const t = typeof o.action === 'string' ? o.action.trim() : typeof o.text === 'string' ? o.text.trim() : '';
      if (t.length >= 4) out.push({ text: t.slice(0, 300), priority: PRIORITY_IN[String(o.priority ?? '').toLowerCase()] ?? 'medium' });
    }
  }
  return out;
}

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

/**
 * Son 30 günün olumsuz/nötr yorumlarındaki AI aksiyon önerileri — birleştirilmiş, kanıt sayılı.
 * Salt okuma (LLM yok, kayıt yok). Zaten görev olmuş ya da gizlenmiş öneriler hariç.
 */
export async function listTaskSuggestions(dealerId: string, now: Date = new Date()): Promise<TaskSuggestion[]> {
  const since = new Date(now.getTime() - SUGGESTION_LOOKBACK_DAYS * DAY_MS);
  const [feedbacks, tasks, dismissed] = await Promise.all([
    prisma.feedback.findMany({
      where: {
        deletedAt: null,
        qrCode: { dealerId },
        createdAt: { gte: since },
        actionSuggestions: { not: Prisma.DbNull },
        OR: [{ rating: { lte: 3 } }, { sentiment: 'negative' }],
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, createdAt: true, actionSuggestions: true },
    }),
    prisma.actionItem.findMany({
      where: { dealerId, createdAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } },
      select: { suggestionText: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    readDismissed(dealerId),
  ]);

  const taken = new Set(tasks.map((t) => suggestionKey(t.suggestionText)));
  const hidden = new Set(dismissed);
  const groups = new Map<string, TaskSuggestion>();
  for (const fb of feedbacks) {
    for (const s of parseSuggestions(fb.actionSuggestions)) {
      const key = suggestionKey(s.text);
      if (taken.has(key) || hidden.has(key)) continue;
      const g = groups.get(key);
      if (!g) {
        groups.set(key, {
          key,
          text: s.text,
          priority: s.priority,
          evidence: 1,
          feedbackIds: [fb.id],
          lastSeenAt: fb.createdAt.toISOString(),
        });
      } else if (!g.feedbackIds.includes(fb.id)) {
        g.evidence += 1;
        if (g.feedbackIds.length < 10) g.feedbackIds.push(fb.id);
        if (PRIORITY_ORDER[s.priority as TaskPriority] < PRIORITY_ORDER[g.priority as TaskPriority]) g.priority = s.priority;
      }
    }
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        b.evidence - a.evidence ||
        PRIORITY_ORDER[a.priority as TaskPriority] - PRIORITY_ORDER[b.priority as TaskPriority] ||
        Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt)
    )
    .slice(0, SUGGESTION_LIMIT);
}

/** Öneriyi bu bayi için gizler (kalıcı; en fazla 300 anahtar tutulur). */
export async function dismissTaskSuggestion(dealerId: string, key: string): Promise<void> {
  if (!/^[0-9a-f]{8}$/.test(key)) throw new ApiError('VALIDATION', 'Geçersiz öneri anahtarı.');
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${DISMISSED_KEY(dealerId)}))`;
    const row = await tx.settings.findUnique({ where: { key: DISMISSED_KEY(dealerId) }, select: { value: true } });
    const v = row?.value as { keys?: unknown } | null | undefined;
    const keys = Array.isArray(v?.keys) ? (v.keys as unknown[]).filter((k): k is string => typeof k === 'string') : [];
    if (keys.includes(key)) return;
    const next = [...keys, key].slice(-DISMISSED_MAX);
    await tx.settings.upsert({
      where: { key: DISMISSED_KEY(dealerId) },
      create: { key: DISMISSED_KEY(dealerId), value: { keys: next }, category: 'dealer_tasks' },
      update: { value: { keys: next } },
    });
  });
}
