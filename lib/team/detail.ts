import { prisma } from '@/lib/prisma';
import { toServedUrl } from '@/lib/storage/served-url';
import { findVisibleTask } from './access';
import {
  canAttach,
  canDeleteAttachment,
  canDeleteComment,
  canEditChecklist,
  canEditComment,
  canLogTime,
  canMoveTask,
  moveTargetsFor,
  type TeamViewer,
} from './permissions';
import { dueDayOf, isOverdue } from './dates';
import { taskHasProof } from './transitions';
import { INITIATIVE_SOURCE } from './constants';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Detay paneli verisi + bu görüntüleyicinin bu görevdeki yetenekleri (UI yalnız bunlara bakar). */
export async function loadTaskDetail(viewer: TeamViewer, id: string) {
  const t = await findVisibleTask(viewer, id, {
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
    createdBy: { select: { id: true, name: true } },
    approvedBy: { select: { id: true, name: true } },
    blockedBy: { select: { id: true, title: true, status: true } },
    checklist: {
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, text: true, done: true, dueAt: true, assignedTo: { select: { id: true, name: true, image: true } } },
    },
    comments: {
      orderBy: { createdAt: 'asc' },
      take: 300,
      select: {
        id: true,
        text: true,
        createdAt: true,
        editedAt: true,
        parentId: true,
        attachmentPath: true,
        attachmentName: true,
        authorId: true,
        author: { select: { id: true, name: true, image: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
    },
    activities: {
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: { id: true, action: true, detail: true, createdAt: true, actor: { select: { id: true, name: true } } },
    },
    attachments: {
      orderBy: { createdAt: 'desc' },
      select: { id: true, filename: true, path: true, mime: true, size: true, createdAt: true, uploadedById: true, uploadedBy: { select: { name: true } } },
    },
  });

  const hasProof = t.status === 'done' ? true : await taskHasProof(t.id, t.assignedToId);
  const assigneeNotes = t.assignedToId ? t.comments.filter((c) => c.authorId === t.assignedToId).length : t.comments.length;
  const assigneeFiles = t.assignedToId ? t.attachments.filter((a) => a.uploadedById === t.assignedToId).length : t.attachments.length;
  const done = t.status === 'done';

  // Otomatik görevin kaynağı (denetim #103): olay / aksiyon maddesi başlığı.
  let source: { type: string; label: string } | null = null;
  if (t.sourceType === 'incident' && t.sourceRef) {
    const inc = await prisma.incident.findUnique({ where: { id: t.sourceRef }, select: { title: true, status: true } }).catch(() => null);
    source = { type: 'incident', label: inc ? `Olay: ${inc.title} (${inc.status})` : 'Olay kaydı (silinmiş)' };
  } else if (t.sourceType === 'action-item' && t.sourceRef) {
    const ai = await prisma.actionItem.findUnique({ where: { id: t.sourceRef }, select: { suggestionText: true, status: true } }).catch(() => null);
    source = { type: 'action-item', label: ai ? `Aksiyon maddesi (${ai.status}): ${ai.suggestionText.slice(0, 80)}` : 'Aksiyon maddesi (silinmiş)' };
  }

  return {
    task: {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      department: t.department,
      weekKey: t.weekKey,
      dueAt: iso(t.dueAt),
      dueDay: dueDayOf(t.dueAt),
      overdue: !done && isOverdue(t.dueAt),
      tags: t.tags,
      estimateMin: t.estimateMin,
      spentMin: t.spentMin,
      recurrence: t.recurrence,
      blockedById: t.blockedById,
      blockedBy: t.blockedBy,
      submittedForReviewAt: iso(t.submittedForReviewAt),
      approvedAt: iso(t.approvedAt),
      approvedBy: t.approvedBy,
      reviewNote: t.reviewNote,
      sourceType: t.sourceType === INITIATIVE_SOURCE ? null : t.sourceType,
      source,
      archivedAt: iso(t.archivedAt),
      completedAt: iso(t.completedAt),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      createdBy: t.createdBy,
      assignedTo: t.assignedTo,
      assignedToId: t.assignedToId,
      checklist: t.checklist.map((c) => ({ ...c, dueAt: iso(c.dueAt), dueDay: dueDayOf(c.dueAt) })),
      comments: t.comments.map((c) => ({
        id: c.id,
        text: c.text,
        createdAt: c.createdAt.toISOString(),
        editedAt: iso(c.editedAt),
        parentId: c.parentId,
        attachmentPath: c.attachmentPath ? toServedUrl(c.attachmentPath, { kind: 'task', taskId: t.id }) : null,
        attachmentName: c.attachmentName,
        author: c.author,
        reactions: c.reactions,
        canEdit: canEditComment(viewer, c),
        canDelete: canDeleteComment(viewer, c),
      })),
      activities: t.activities.map((a) => ({
        id: a.id,
        action: a.action,
        detail: a.detail,
        createdAt: a.createdAt.toISOString(),
        actorName: a.action.startsWith('system_') ? 'Sistem' : a.actor?.name ?? 'Eski üye',
      })),
      attachments: t.attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        path: toServedUrl(a.path, { kind: 'task', taskId: t.id }) ?? '',
        mime: a.mime,
        size: a.size,
        createdAt: a.createdAt.toISOString(),
        uploadedByName: a.uploadedBy?.name ?? null,
        canDelete: canDeleteAttachment(viewer, a),
      })),
    },
    proof: { ok: hasProof, notes: assigneeNotes, files: assigneeFiles },
    can: {
      move: canMoveTask(viewer, t),
      moveTargets: moveTargetsFor(viewer, t),
      editFields: viewer.isManager,
      attach: canAttach(viewer, t),
      editChecklist: canEditChecklist(viewer, t),
      logTime: canLogTime(viewer, t),
      comment: true,
      approve: viewer.isManager,
      archive: viewer.isManager,
    },
  };
}

export type TaskDetailPayload = Awaited<ReturnType<typeof loadTaskDetail>>;
