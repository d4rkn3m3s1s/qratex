/**
 * "Bana atananlar" — iş (görev + vaka) sözleşmesi ve görev durum makinesi (saf).
 *
 * Denetim (action-items) bulgu 7: UI yalnız `done` gönderiyor, `completedAt` istemci saatinden
 * geliyor, iptal/yeniden açma yoktu. Artık geçişler `applyTaskPatch` ile sunucuda hesaplanır:
 * `completedAt` sunucu saatidir, yeniden açılınca temizlenir; atama `pending ↔ assigned`
 * durumunu kendiliğinden çevirir.
 */

export type WorkKind = 'task' | 'incident';
export type WorkPriority = 'critical' | 'high' | 'medium' | 'low';
export type WorkStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

export const WORK_SCOPES = ['mine', 'team', 'unassigned', 'closed'] as const;
export type WorkScope = (typeof WORK_SCOPES)[number];

export function normalizeWorkScope(v: unknown): WorkScope {
  return typeof v === 'string' && (WORK_SCOPES as readonly string[]).includes(v) ? (v as WorkScope) : 'mine';
}

export const WORK_KIND_FILTERS = ['all', 'task', 'incident'] as const;
export type WorkKindFilter = (typeof WORK_KIND_FILTERS)[number];

export function normalizeWorkKind(v: unknown): WorkKindFilter {
  return typeof v === 'string' && (WORK_KIND_FILTERS as readonly string[]).includes(v) ? (v as WorkKindFilter) : 'all';
}

export const TASK_RAW_STATUSES = ['pending', 'assigned', 'in_progress', 'done', 'cancelled'] as const;
export type TaskRawStatus = (typeof TASK_RAW_STATUSES)[number];
export const OPEN_TASK_STATUSES: readonly TaskRawStatus[] = ['pending', 'assigned', 'in_progress'];

export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export function toTaskRawStatus(raw: string | null | undefined): TaskRawStatus {
  return (TASK_RAW_STATUSES as readonly string[]).includes(raw ?? '') ? (raw as TaskRawStatus) : 'pending';
}

export function toTaskPriority(raw: string | null | undefined): TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(raw ?? '') ? (raw as TaskPriority) : 'medium';
}

export function workStatusOfTask(raw: string): WorkStatus {
  const s = toTaskRawStatus(raw);
  if (s === 'in_progress') return 'in_progress';
  if (s === 'done') return 'done';
  if (s === 'cancelled') return 'cancelled';
  return 'open';
}

export function workStatusOfIncident(raw: string): WorkStatus {
  if (raw === 'in_progress') return 'in_progress';
  if (raw === 'resolved') return 'done';
  return 'open';
}

export const PRIORITY_RANK: Readonly<Record<WorkPriority, number>> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Görev için izinli hedef durumlar. */
export function allowedTaskTransitions(status: WorkStatus): WorkStatus[] {
  switch (status) {
    case 'open':
      return ['in_progress', 'done', 'cancelled'];
    case 'in_progress':
      return ['open', 'done', 'cancelled'];
    case 'done':
    case 'cancelled':
      return ['open'];
    default:
      return [];
  }
}

export interface TaskState {
  status: TaskRawStatus;
  assignedToId: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  priority: TaskPriority;
}

export interface TaskPatch {
  status?: WorkStatus;
  assignedToId?: string | null;
  dueAt?: Date | null;
  priority?: TaskPriority;
}

export type TaskEvent =
  | { kind: 'status'; from: TaskRawStatus; to: TaskRawStatus }
  | { kind: 'assigned'; from: string | null; to: string | null }
  | { kind: 'priority'; from: TaskPriority; to: TaskPriority }
  | { kind: 'due'; from: string | null; to: string | null };

export type TaskPatchResult =
  | { ok: true; next: TaskState; events: TaskEvent[]; changed: boolean }
  | { ok: false; code: 'INVALID_TRANSITION'; message: string };

function openRaw(assignedToId: string | null): TaskRawStatus {
  return assignedToId ? 'assigned' : 'pending';
}

/** Görev güncellemesini hesaplar (saf). */
export function applyTaskPatch(current: TaskState, patch: TaskPatch, now: Date): TaskPatchResult {
  const next: TaskState = { ...current };
  const events: TaskEvent[] = [];

  if (patch.assignedToId !== undefined && patch.assignedToId !== current.assignedToId) {
    next.assignedToId = patch.assignedToId;
    events.push({ kind: 'assigned', from: current.assignedToId, to: patch.assignedToId });
    if (next.status === 'pending' || next.status === 'assigned') next.status = openRaw(next.assignedToId);
  }

  if (patch.status !== undefined) {
    const currentWork = workStatusOfTask(current.status);
    if (patch.status !== currentWork) {
      if (!allowedTaskTransitions(currentWork).includes(patch.status)) {
        return { ok: false, code: 'INVALID_TRANSITION', message: 'Bu görev bu duruma geçirilemez.' };
      }
      next.status = patch.status === 'open' ? openRaw(next.assignedToId) : patch.status;
    }
  }

  if (next.status !== current.status) {
    events.push({ kind: 'status', from: current.status, to: next.status });
    if (next.status === 'done') next.completedAt = now;
    else if (current.status === 'done') next.completedAt = null;
  }

  if (patch.priority !== undefined && patch.priority !== current.priority) {
    next.priority = patch.priority;
    events.push({ kind: 'priority', from: current.priority, to: patch.priority });
  }

  if (patch.dueAt !== undefined) {
    const from = current.dueAt ? current.dueAt.toISOString() : null;
    const to = patch.dueAt ? patch.dueAt.toISOString() : null;
    if (from !== to) {
      next.dueAt = patch.dueAt;
      events.push({ kind: 'due', from, to });
    }
  }

  return { ok: true, next, events, changed: events.length > 0 };
}

export interface SortableWork {
  priority: WorkPriority;
  dueAt: string | null;
  overdue: boolean;
  createdAt: string;
  closedAt: string | null;
  status: WorkStatus;
}

/** Açık işler: geciken → öncelik → son tarih (yakın önce, tarihsiz sonda) → yeni önce. */
export function compareOpenWork(a: SortableWork, b: SortableWork): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (p !== 0) return p;
  const ad = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
  const bd = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

/** Kapanan işler: en son kapanan önce. */
export function compareClosedWork(a: SortableWork, b: SortableWork): number {
  const ac = Date.parse(a.closedAt ?? a.createdAt);
  const bc = Date.parse(b.closedAt ?? b.createdAt);
  return bc - ac;
}

export function isTaskOverdue(status: WorkStatus, dueAt: Date | string | null, now: Date = new Date()): boolean {
  if (!dueAt || status === 'done' || status === 'cancelled') return false;
  return new Date(dueAt).getTime() < now.getTime();
}

/* ───────────────────────── Öneriler ───────────────────────── */

/** Öneri metninin karşılaştırma anahtarı: küçük harf (TR), noktalama yok, tek boşluk. */
export function normalizeSuggestionText(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/** FNV-1a 32 bit → 8 haneli hex (kalıcı "gizlenen öneriler" listesi için kısa anahtar). */
export function suggestionKey(text: string): string {
  const s = normalizeSuggestionText(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const TASK_TEXT_MAX = 1000;
export const WORK_PAGE_SIZE = 25;
/** Açık işler bellekte sıralanır; kaynak başına üst sınır. */
export const OPEN_WORK_CAP = 300;
export const SUGGESTION_LIMIT = 6;
export const SUGGESTION_LOOKBACK_DAYS = 30;
