import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { PRIORITY_META, RECURRENCE_LABEL, STATUS_META, isTaskPriority, isTaskStatus, priorityRank } from './constants';
import { dueDayOf, effectiveDue, endOfIstanbulDay, isOverdue, shortDayLabel } from './dates';
import { removeStoredTaskFiles } from './files';

/** Liste/pano kartı için seçim (e-posta yok: kart avatar + ad gösterir). */
export const TASK_LIST_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  department: true,
  weekKey: true,
  dueAt: true,
  tags: true,
  estimateMin: true,
  spentMin: true,
  recurrence: true,
  blockedById: true,
  submittedForReviewAt: true,
  approvedAt: true,
  reviewNote: true,
  sourceType: true,
  sourceRef: true,
  archivedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  assignedToId: true,
  assignedTo: { select: { id: true, name: true, image: true } },
  blockedBy: { select: { id: true, title: true, status: true } },
  _count: { select: { comments: true, attachments: true, checklist: true } },
} satisfies Prisma.CompanyTaskSelect;

export type TaskListRow = Prisma.CompanyTaskGetPayload<{ select: typeof TASK_LIST_SELECT }>;

export type TaskDto = Omit<TaskListRow, 'dueAt' | 'submittedForReviewAt' | 'approvedAt' | 'archivedAt' | 'completedAt' | 'createdAt' | 'updatedAt'> & {
  dueAt: string | null;
  dueDay: string | null;
  overdue: boolean;
  submittedForReviewAt: string | null;
  approvedAt: string | null;
  archivedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Önceki haftadan devreden açık görev (denetim Y2). */
  carriedOver: boolean;
  /** Revizyon istendi: reddedilmiş/yeniden açılmış ve henüz tekrar gönderilmemiş. */
  revisionRequested: boolean;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toTaskDto(row: TaskListRow, opts: { weekKey?: string; now?: Date } = {}): TaskDto {
  const now = opts.now ?? new Date();
  const done = row.status === 'done';
  return {
    ...row,
    dueAt: iso(row.dueAt),
    dueDay: dueDayOf(row.dueAt),
    overdue: !done && isOverdue(row.dueAt, now),
    submittedForReviewAt: iso(row.submittedForReviewAt),
    approvedAt: iso(row.approvedAt),
    archivedAt: iso(row.archivedAt),
    completedAt: iso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    carriedOver: !!opts.weekKey && !!row.weekKey && row.weekKey < opts.weekKey && !done,
    revisionRequested:
      (row.status === 'todo' || row.status === 'in_progress') && !!row.reviewNote && !row.submittedForReviewAt && !row.approvedAt,
  };
}

export const TASK_SORTS = ['default', 'priority', 'due', 'title', 'created', 'updated', 'spent'] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

const STATUS_ORDER: Record<string, number> = { todo: 0, in_progress: 1, review: 2, done: 3 };

/**
 * Sıralama bellekte (öncelik sayısal sırayla; denetim O2: string "desc" sıralaması
 * Yüksek önceliği en sona atıyordu). Varsayılan: durum → öncelik ↓ → bitiş ↑ (boşlar sonda) → yeni.
 */
export function sortTasks<T extends { status: string; priority: string; dueAt: Date | string | null; title: string; createdAt: Date | string; updatedAt: Date | string; spentMin: number }>(
  rows: T[],
  sort: TaskSort
): T[] {
  const t = (d: Date | string | null) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY);
  const due = (r: T) => effectiveDue(r.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  const byCreatedDesc = (a: T, b: T) => t(b.createdAt) - t(a.createdAt);
  const byPriority = (a: T, b: T) => priorityRank(b.priority) - priorityRank(a.priority);
  const byDue = (a: T, b: T) => due(a) - due(b);
  const cmp: Record<TaskSort, (a: T, b: T) => number> = {
    default: (a, b) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || byPriority(a, b) || byDue(a, b) || byCreatedDesc(a, b),
    priority: (a, b) => byPriority(a, b) || byDue(a, b) || byCreatedDesc(a, b),
    due: (a, b) => byDue(a, b) || byPriority(a, b),
    title: (a, b) => a.title.localeCompare(b.title, 'tr'),
    created: byCreatedDesc,
    updated: (a, b) => t(b.updatedAt) - t(a.updatedAt),
    spent: (a, b) => b.spentMin - a.spentMin || byCreatedDesc(a, b),
  };
  return [...rows].sort(cmp[sort] ?? cmp.default);
}

/** `YYYY-MM-DD` → İstanbul gün sonu. Geçersizse 400. */
export function parseDueDay(day: string | null | undefined): Date | null {
  if (day === null || day === undefined || day === '') return null;
  const d = endOfIstanbulDay(day);
  if (!d) throw new ApiError('VALIDATION', 'Bitiş tarihi geçersiz.');
  return d;
}

/**
 * Bağımlılık döngüsü (denetim: yalnız A↔B kontrol ediliyordu; A→B→C→A geçiyordu).
 * `taskId` göreve `blockerId` bağımlılığı eklenirse zincir taskId'ye geri dönüyor mu?
 */
export async function assertNoDependencyCycle(taskId: string, blockerId: string): Promise<void> {
  if (taskId === blockerId) throw new ApiError('VALIDATION', 'Görev kendine bağımlı olamaz.');
  let cursor: string | null = blockerId;
  for (let i = 0; i < 50 && cursor; i++) {
    const row: { blockedById: string | null } | null = await prisma.companyTask.findUnique({
      where: { id: cursor },
      select: { blockedById: true },
    });
    if (!row) return;
    if (row.blockedById === taskId) throw new ApiError('VALIDATION', 'Bu bağımlılık döngü oluşturur.');
    cursor = row.blockedById;
  }
}

type FieldSnapshot = {
  title: string;
  description: string | null;
  priority: string;
  department: string | null;
  dueAt: Date | null;
  tags: string | null;
  estimateMin: number | null;
  recurrence: string | null;
  weekKey: string | null;
  blockedById: string | null;
  archivedAt: Date | null;
};

/** Alan değişiklikleri için okunur aktivite satırları (denetim: yalnız durum/atama/öncelik loglanıyordu). */
export function fieldActivities(
  before: FieldSnapshot,
  after: FieldSnapshot,
  names: { departments: Map<string, string> }
): Array<{ action: string; detail: string }> {
  const out: Array<{ action: string; detail: string }> = [];
  if (before.title !== after.title) out.push({ action: 'edited', detail: `Başlığı "${after.title.slice(0, 80)}" yaptı` });
  if ((before.description ?? '') !== (after.description ?? '')) out.push({ action: 'edited', detail: 'Açıklamayı güncelledi' });
  if (before.priority !== after.priority && isTaskPriority(after.priority)) {
    out.push({ action: 'priority', detail: `Önceliği "${PRIORITY_META[after.priority].label}" yaptı` });
  }
  if (before.department !== after.department) {
    out.push({
      action: 'edited',
      detail: after.department ? `Departmanı "${names.departments.get(after.department) ?? after.department}" yaptı` : 'Departmanı kaldırdı',
    });
  }
  const bDue = dueDayOf(before.dueAt);
  const aDue = dueDayOf(after.dueAt);
  if (bDue !== aDue) out.push({ action: 'edited', detail: aDue ? `Bitiş tarihini ${shortDayLabel(aDue)} yaptı` : 'Bitiş tarihini kaldırdı' });
  if ((before.tags ?? '') !== (after.tags ?? '')) out.push({ action: 'edited', detail: 'Etiketleri güncelledi' });
  if (before.estimateMin !== after.estimateMin) {
    out.push({ action: 'edited', detail: after.estimateMin ? `Tahmini süreyi ${after.estimateMin} dk yaptı` : 'Tahmini süreyi kaldırdı' });
  }
  if (before.recurrence !== after.recurrence) {
    out.push({ action: 'edited', detail: after.recurrence ? `Tekrarı "${RECURRENCE_LABEL[after.recurrence] ?? after.recurrence}" yaptı` : 'Tekrarı kaldırdı' });
  }
  if (before.weekKey !== after.weekKey && after.weekKey) out.push({ action: 'edited', detail: `Görevi ${after.weekKey} haftasına taşıdı` });
  if (before.blockedById !== after.blockedById) out.push({ action: 'edited', detail: after.blockedById ? 'Bağımlılık ekledi' : 'Bağımlılığı kaldırdı' });
  if (!!before.archivedAt !== !!after.archivedAt) out.push({ action: 'archived', detail: after.archivedAt ? 'Arşivledi' : 'Arşivden çıkardı' });
  return out;
}

/** Görevleri kalıcı siler + eklerini depodan kaldırır (yalnız arşivdeki görevler). */
export async function hardDeleteTasks(ids: string[]): Promise<{ deleted: number; files: string[] }> {
  if (ids.length === 0) return { deleted: 0, files: [] };
  const [attachments, commentFiles] = await Promise.all([
    prisma.taskAttachment.findMany({ where: { taskId: { in: ids } }, select: { path: true } }),
    prisma.taskComment.findMany({ where: { taskId: { in: ids }, attachmentPath: { not: null } }, select: { attachmentPath: true } }),
  ]);
  const res = await prisma.companyTask.deleteMany({ where: { id: { in: ids }, archivedAt: { not: null } } });
  return { deleted: res.count, files: [...attachments.map((a) => a.path), ...commentFiles.map((c) => c.attachmentPath ?? '')] };
}

export async function cleanupFiles(files: string[]): Promise<void> {
  await removeStoredTaskFiles(files);
}

export function statusLabel(s: string): string {
  return isTaskStatus(s) ? STATUS_META[s].label : s;
}

/**
 * Atama bildirimi (e-posta + uygulama içi) — alıcının paneline göre bağlantıyla.
 * Tekil PUT, oluşturma, şablon, toplu atama ve kopyalama aynı yolu kullanır
 * (denetim Bulgu 37/39: toplu atamada bildirim yoktu).
 */
export async function notifyAssignment(opts: {
  taskId: string;
  assigneeId: string;
  title: string;
  priority: string;
  dueAt: Date | null;
  description: string | null;
}): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: opts.assigneeId }, select: { email: true, name: true, role: true } });
  if (!user) return;
  const [{ teamTaskHref }, { getPublicAppOrigin }, email, notify] = await Promise.all([
    import('./href'),
    import('@/lib/public-app-origin'),
    import('@/lib/team-email'),
    import('@/lib/team-notify'),
  ]);
  const link = `${getPublicAppOrigin().replace(/\/$/, '')}${teamTaskHref(user.role, opts.taskId)}`;
  await Promise.allSettled([
    user.email
      ? email.sendTaskAssignedEmail({
          to: user.email,
          assigneeName: user.name,
          taskTitle: opts.title,
          priority: opts.priority,
          dueAt: effectiveDue(opts.dueAt),
          description: opts.description,
          link,
        })
      : Promise.resolve(),
    notify.notifyTaskAssigned({ userId: opts.assigneeId, taskId: opts.taskId, taskTitle: opts.title, priority: opts.priority }),
  ]);
}
