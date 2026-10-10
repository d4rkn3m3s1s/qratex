import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { INITIATIVE_SOURCE, STATUS_META, isTaskStatus, type TaskStatus } from './constants';
import { checkTransition, type TransitionActor } from './permissions';

/**
 * Görev durum geçişi — TEK uygulama (denetim O3 / admin_ekip Bulgu 4).
 * Tekil PUT, toplu işlem, otomasyon motoru ve bakım cron'u burayı çağırır; kural (kim, nereden,
 * nereye), kanıt (onaya/bitişe en az bir not veya dosya), bağımlılık (bağlı görev bitmeden
 * "Bitti" yok), damgalar (onaya gönderim, onaylayan, tamamlanma), aktivite ve bildirim tek yerde.
 *
 * Atomik: güncelleme `where { id, status: from }` ile yapılır; arada başkası durumu değiştirdiyse
 * 409 döner (iki yönetici aynı anda onaylarsa çift bildirim olmaz).
 */

export type TransitionSideEffect = () => Promise<unknown>;

export type TransitionResult = {
  kind: 'noop' | 'start' | 'submit' | 'withdraw' | 'approve' | 'reject' | 'reopen' | 'move';
  from: TaskStatus;
  to: TaskStatus;
  /** Yanıt döndükten sonra (`after`) çalıştırılacak bildirim/otomasyon işleri. */
  effects: TransitionSideEffect[];
};

export type TransitionInput = {
  taskId: string;
  to: TaskStatus;
  actor: { userId: string | null; kind: TransitionActor; name?: string | null };
  /** Red notu, yeniden açma gerekçesi ya da onay notu. */
  note?: string | null;
  /** Otomasyon tetiklensin mi (otomasyonun kendi geçişinde kapalı: zincirleme yok). */
  triggerAutomations?: boolean;
};

/** Kanıt: atananın yazdığı en az bir not ya da yüklediği bir dosya (atanmamışsa herkesinki). */
export async function taskHasProof(taskId: string, assigneeId: string | null): Promise<boolean> {
  const by = assigneeId ? { authorId: assigneeId } : {};
  const upBy = assigneeId ? { uploadedById: assigneeId } : {};
  const [comments, attachments] = await Promise.all([
    prisma.taskComment.count({ where: { taskId, ...by } }),
    prisma.taskAttachment.count({ where: { taskId, ...upBy } }),
  ]);
  return comments + attachments > 0;
}

const ACTIVITY_TEXT: Record<TransitionResult['kind'], (to: TaskStatus) => string> = {
  noop: () => '',
  start: () => 'Göreve başladı',
  submit: () => 'Onaya gönderdi',
  withdraw: (to) => `Onaydan geri çekti (${STATUS_META[to].label})`,
  approve: () => 'Onayladı',
  reject: () => 'Revizyon istedi',
  reopen: () => 'Onaylanmış görevi yeniden açtı',
  move: (to) => `Durumu "${STATUS_META[to].label}" yaptı`,
};

export async function transitionTask(input: TransitionInput): Promise<TransitionResult> {
  const task = await prisma.companyTask.findUnique({
    where: { id: input.taskId },
    select: {
      id: true,
      title: true,
      status: true,
      assignedToId: true,
      createdById: true,
      blockedById: true,
      department: true,
      tags: true,
      sourceType: true,
      archivedAt: true,
    },
  });
  if (!task || task.sourceType === INITIATIVE_SOURCE) throw new ApiError('NOT_FOUND', 'Görev bulunamadı.');
  if (!isTaskStatus(task.status)) throw new ApiError('CONFLICT', 'Görevin durumu tanınmıyor.');
  const from = task.status;
  const to = input.to;

  const check = checkTransition(from, to, input.actor.kind, { note: input.note });
  if (!check.ok) {
    const status = check.code === 'REOPEN_NOTE_REQUIRED' || check.code === 'INVALID_TRANSITION' ? 400 : 403;
    throw new ApiError(check.code, check.message, { status });
  }
  if (check.kind === 'noop') return { kind: 'noop', from, to, effects: [] };
  if (task.archivedAt && input.actor.kind !== 'manager') {
    throw new ApiError('CONFLICT', 'Arşivlenmiş görevin durumu değiştirilemez.');
  }

  // Kanıt: onaya gönderirken ve "Bitti"ye geçerken HER ZAMAN yeniden sayılır (onaya giderken
  // vardı ama sonradan silinmiş olabilir).
  if (to === 'review' || to === 'done') {
    const proof = await taskHasProof(task.id, task.assignedToId);
    if (!proof) {
      throw new ApiError(
        'PROOF_REQUIRED',
        to === 'done'
          ? 'Onaylamak için görevde atanan kişinin en az bir notu ya da dosyası olmalı.'
          : 'Onaya göndermek için ne yaptığını not olarak yaz ya da bir dosya ekle.',
        { status: 409 }
      );
    }
  }
  if (to === 'done' && task.blockedById) {
    const blocker = await prisma.companyTask.findUnique({ where: { id: task.blockedById }, select: { status: true, title: true } });
    if (blocker && blocker.status !== 'done') {
      throw new ApiError('BLOCKED', `Önce bağlı olduğu "${blocker.title}" görevi tamamlanmalı.`, { status: 409 });
    }
  }

  const now = new Date();
  const data: Prisma.CompanyTaskUncheckedUpdateManyInput = { status: to };
  const note = input.note?.trim() || null;
  switch (check.kind) {
    case 'submit':
      data.submittedForReviewAt = now;
      break;
    case 'withdraw':
      data.submittedForReviewAt = null;
      break;
    case 'approve':
      data.completedAt = now;
      data.approvedAt = now;
      data.approvedById = input.actor.kind === 'manager' ? input.actor.userId : null;
      data.reviewNote = note;
      break;
    case 'reject':
      data.submittedForReviewAt = null;
      data.reviewNote = note;
      break;
    case 'reopen':
      data.completedAt = null;
      data.approvedAt = null;
      data.approvedById = null;
      data.reviewNote = note;
      if (to !== 'review') data.submittedForReviewAt = null;
      else data.submittedForReviewAt = now;
      break;
    default:
      if (to === 'review') data.submittedForReviewAt = now;
      break;
  }

  const res = await prisma.companyTask.updateMany({ where: { id: task.id, status: from }, data });
  if (res.count === 0) throw new ApiError('CONFLICT', 'Görev bu arada başka biri tarafından güncellendi. Sayfayı yenileyin.');

  const actorId = input.actor.userId ?? task.createdById;
  const detailBase = ACTIVITY_TEXT[check.kind](to);
  const detail = note && (check.kind === 'reject' || check.kind === 'reopen' || check.kind === 'approve')
    ? `${detailBase}: ${note.slice(0, 160)}`
    : detailBase;
  await prisma.taskActivity
    .create({
      data: {
        taskId: task.id,
        actorId,
        action: input.actor.kind === 'system' ? 'system_status' : input.actor.kind === 'automation' ? 'automation' : 'status',
        detail: input.actor.kind === 'automation' ? `Otomasyon: ${detail}` : detail,
      },
    })
    .catch(() => undefined);

  const effects: TransitionSideEffect[] = [];
  const actorName = input.actor.name ?? null;
  const notify = () => import('@/lib/team-notify');

  if (check.kind === 'submit' && input.actor.userId) {
    effects.push(() =>
      notify().then((m) =>
        m.notifyTaskSubmittedForReview({
          taskId: task.id,
          taskTitle: task.title,
          submittedById: input.actor.userId!,
          submittedByName: actorName,
          createdById: task.createdById,
        })
      )
    );
  }
  if (check.kind === 'approve') {
    if (input.actor.kind === 'system') {
      effects.push(() => notify().then((m) => m.notifyTaskAutoApproved({ taskId: task.id, taskTitle: task.title, assignedToId: task.assignedToId })));
    } else {
      if (task.assignedToId && task.assignedToId !== input.actor.userId) {
        effects.push(() =>
          notify().then((m) =>
            m.notifyTaskReviewed({ userId: task.assignedToId!, taskId: task.id, taskTitle: task.title, approved: true, byName: actorName })
          )
        );
      }
      if (input.actor.userId) {
        effects.push(() =>
          notify().then((m) =>
            m.notifyTaskCompleted({
              taskId: task.id,
              taskTitle: task.title,
              completedById: input.actor.userId!,
              completedByName: actorName,
              createdById: task.createdById,
            })
          )
        );
      }
    }
  }
  if (check.kind === 'reject' && task.assignedToId && task.assignedToId !== input.actor.userId) {
    effects.push(() =>
      notify().then((m) =>
        m.notifyTaskReviewed({ userId: task.assignedToId!, taskId: task.id, taskTitle: task.title, approved: false, byName: actorName, note })
      )
    );
  }
  if (check.kind === 'reopen' && task.assignedToId && task.assignedToId !== input.actor.userId) {
    effects.push(() =>
      notify().then((m) => m.notifyTaskReopened({ userId: task.assignedToId!, taskId: task.id, taskTitle: task.title, byName: actorName, note }))
    );
  }
  if (input.triggerAutomations !== false && input.actor.kind !== 'automation') {
    effects.push(() =>
      import('@/lib/team-automation-engine').then((m) =>
        m.runAutomations({
          trigger: 'status_changed',
          triggerValue: to,
          task: { id: task.id, title: task.title, department: task.department, assignedToId: task.assignedToId, tags: task.tags },
          actorId: actorId,
        })
      )
    );
  }

  return { kind: check.kind, from, to, effects };
}

/** Yan etkileri sırayla, birbirini bozmadan çalıştırır. */
export async function runEffects(effects: TransitionSideEffect[]): Promise<void> {
  for (const fx of effects) {
    try {
      await fx();
    } catch (err) {
      console.warn('[team] yan etki başarısız:', err);
    }
  }
}
