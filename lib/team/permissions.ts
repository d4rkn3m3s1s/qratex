/**
 * Ekip modülü yetenek matrisi + durum makinesi — TEK kaynak (saf; sunucu ve istemci).
 *
 * Denetim Y1: "AI Özet" butonu koşulsuz gösterilip API'de yönetici isteniyordu, "Süre ekle"
 * üyeye görünüp 403 alıyordu; O3/Bulgu 4: onay kuralı PUT, toplu işlem, otomasyon ve cron'da
 * dört farklı biçimde uygulanıyordu. Artık arayüz ve API aynı fonksiyonlardan okur.
 */
import type { TaskStatus } from './constants';

export type TeamRole = 'yonetici' | 'uye';

export type TeamViewer = {
  userId: string;
  name: string | null;
  /** Platform rolü (ADMIN, CUSTOMER, DEALER, STAFF). */
  role: string;
  isAdmin: boolean;
  isManager: boolean;
  teamRole: TeamRole | null;
  /** Üye olduğu departman slug'ları (junction; boşsa birincil departman). */
  departments: string[];
  primaryDepartment: string | null;
};

/** İstemciye giden yetenekler (UI yalnız bunlara bakar). */
export type TeamCapabilities = {
  createTask: boolean;
  editAnyTask: boolean;
  approve: boolean;
  bulk: boolean;
  automations: boolean;
  templates: boolean;
  tags: boolean;
  autotask: boolean;
  aiSummary: boolean;
  aiAssist: boolean;
  aiAsk: boolean;
  reports: boolean;
  manageDepartments: boolean;
  manageMembers: boolean;
  manageInitiatives: boolean;
  shareViews: boolean;
  hardDelete: boolean;
};

export function capabilitiesFor(v: Pick<TeamViewer, 'isManager' | 'isAdmin'>): TeamCapabilities {
  const m = v.isManager;
  return {
    createTask: m,
    editAnyTask: m,
    approve: m,
    bulk: m,
    automations: m,
    templates: m,
    tags: m,
    autotask: m,
    aiSummary: m,
    aiAssist: m,
    aiAsk: true,
    reports: m,
    manageDepartments: m,
    manageMembers: m,
    manageInitiatives: m,
    shareViews: m,
    hardDelete: m,
  };
}

type TaskLike = { assignedToId: string | null; createdById?: string | null; status?: string };

export function isAssignee(v: Pick<TeamViewer, 'userId'>, t: TaskLike): boolean {
  return !!t.assignedToId && t.assignedToId === v.userId;
}

/** Görevin durumunu değiştirebilir mi (geçiş kuralları ayrıca `checkTransition`'da). */
export function canMoveTask(v: TeamViewer, t: TaskLike): boolean {
  return v.isManager || isAssignee(v, t);
}

/** Dosya ekleyebilir mi (kanıt). Atanan, oluşturan ve yönetici. */
export function canAttach(v: TeamViewer, t: TaskLike): boolean {
  return v.isManager || isAssignee(v, t) || (!!t.createdById && t.createdById === v.userId);
}

/** Alt görev ekle/işaretle/sil. */
export function canEditChecklist(v: TeamViewer, t: TaskLike): boolean {
  return canAttach(v, t);
}

/** Süre kaydı: işi yapan kişi (atanan) veya yönetici (denetim Y1). */
export function canLogTime(v: TeamViewer, t: TaskLike): boolean {
  return v.isManager || isAssignee(v, t);
}

/** Yorum: görevi görebilen herkes (kanıt sayımı yalnız atananın notlarını sayar). */
export function canComment(_v: TeamViewer, _t: TaskLike): boolean {
  return true;
}

export function canEditComment(v: Pick<TeamViewer, 'userId'>, c: { authorId: string }): boolean {
  return c.authorId === v.userId;
}

export function canDeleteComment(v: Pick<TeamViewer, 'userId' | 'isManager'>, c: { authorId: string }): boolean {
  return c.authorId === v.userId || v.isManager;
}

export function canDeleteAttachment(v: Pick<TeamViewer, 'userId' | 'isManager'>, a: { uploadedById: string }): boolean {
  return a.uploadedById === v.userId || v.isManager;
}

// ───────────────────────────── Durum makinesi ─────────────────────────────

export type TransitionActor = 'manager' | 'member' | 'automation' | 'system';

export type TransitionCheck =
  | { ok: true; kind: 'noop' | 'start' | 'submit' | 'withdraw' | 'approve' | 'reject' | 'reopen' | 'move' }
  | { ok: false; code: 'NEEDS_APPROVAL' | 'REOPEN_FORBIDDEN' | 'REOPEN_NOTE_REQUIRED' | 'INVALID_TRANSITION'; message: string };

const MEMBER_ALLOWED: ReadonlyArray<readonly [TaskStatus, TaskStatus]> = [
  ['todo', 'in_progress'],
  ['todo', 'review'],
  ['in_progress', 'todo'],
  ['in_progress', 'review'],
  ['review', 'in_progress'],
  ['review', 'todo'],
];

/**
 * Geçiş kuralı.
 *  - Üye: kendi görevini todo ↔ devam → onay arasında taşır; "Bitti"ye geçemez (onay
 *    yöneticide), onaylanmış görevi geri alamaz (denetim O3: onay izini siliyordu).
 *  - Yönetici: her yön; "Bitti"den çıkış (yeniden açma) gerekçe ister.
 *  - Otomasyon: "Bitti"ye geçiremez ve "Bitti"den çıkaramaz (onay akışını atlıyordu).
 *  - Sistem (bakım cron'u): yalnız onaydaki görevi onaylar (review → done).
 */
export function checkTransition(
  from: TaskStatus,
  to: TaskStatus,
  actor: TransitionActor,
  opts: { note?: string | null } = {}
): TransitionCheck {
  if (from === to) return { ok: true, kind: 'noop' };

  if (actor === 'system') {
    return from === 'review' && to === 'done'
      ? { ok: true, kind: 'approve' }
      : { ok: false, code: 'INVALID_TRANSITION', message: 'Sistem yalnız onaydaki görevi onaylayabilir.' };
  }

  if (actor === 'automation') {
    if (to === 'done' || from === 'done') {
      return { ok: false, code: 'INVALID_TRANSITION', message: 'Otomasyon onay akışını atlayamaz.' };
    }
    return { ok: true, kind: to === 'review' ? 'submit' : 'move' };
  }

  if (actor === 'member') {
    if (from === 'done') {
      return { ok: false, code: 'REOPEN_FORBIDDEN', message: 'Onaylanmış görevi yalnız yönetici yeniden açabilir.' };
    }
    if (to === 'done') {
      return {
        ok: false,
        code: 'NEEDS_APPROVAL',
        message: 'Görevi kendin bitirmiş olarak işaretleyemezsin; yöneticinin onayına gönder.',
      };
    }
    const allowed = MEMBER_ALLOWED.some(([a, b]) => a === from && b === to);
    if (!allowed) return { ok: false, code: 'INVALID_TRANSITION', message: 'Bu durum değişikliği yapılamaz.' };
    if (to === 'review') return { ok: true, kind: 'submit' };
    if (from === 'review') return { ok: true, kind: 'withdraw' };
    return { ok: true, kind: from === 'todo' ? 'start' : 'move' };
  }

  // manager
  if (from === 'done') {
    if (!opts.note || !opts.note.trim()) {
      return { ok: false, code: 'REOPEN_NOTE_REQUIRED', message: 'Onaylanmış görevi yeniden açmak için gerekçe yazın.' };
    }
    return { ok: true, kind: 'reopen' };
  }
  if (to === 'done') return { ok: true, kind: 'approve' };
  if (from === 'review') return { ok: true, kind: 'reject' };
  if (to === 'review') return { ok: true, kind: 'submit' };
  return { ok: true, kind: from === 'todo' && to === 'in_progress' ? 'start' : 'move' };
}

/** Arayüzün sunacağı hedefler (sunucu yine `checkTransition` ile doğrular). */
export function moveTargetsFor(v: TeamViewer, t: TaskLike & { status: string }): TaskStatus[] {
  const from = t.status as TaskStatus;
  if (!canMoveTask(v, t)) return [];
  const actor: TransitionActor = v.isManager ? 'manager' : 'member';
  return (['todo', 'in_progress', 'review', 'done'] as const).filter((to) => {
    if (to === from) return false;
    const c = checkTransition(from, to, actor, { note: 'x' });
    return c.ok;
  });
}
