/**
 * Atama bildirimleri — atanan kişiye uygulama içi bildirim (`ctaPath` ile derin link).
 * Bayi sahibi vakayı/görevi Gelen Kutusu'nda açar; personel kendi paneline (`/staff`) yönlenir.
 * Kendine atama bildirim üretmez.
 */
import type { Prisma } from '@prisma/client';
import type { QueueActor } from './audit';

type NotifyDb = Pick<Prisma.TransactionClient, 'notification'>;

export async function notifyAssignment(
  db: NotifyDb,
  params: {
    dealerId: string;
    assigneeId: string;
    actor: QueueActor;
    kind: 'incident' | 'task';
    entityId: string;
    title: string;
  }
): Promise<void> {
  const { dealerId, assigneeId, actor, kind, entityId, title } = params;
  if (assigneeId === actor.id) return;
  const ownerPath = kind === 'incident' ? `/dealer/inbox/incidents?id=${entityId}` : `/dealer/inbox/assigned?id=task-${entityId}`;
  const ctaPath = assigneeId === dealerId ? ownerPath : '/staff';
  await db.notification.create({
    data: {
      userId: assigneeId,
      title: kind === 'incident' ? 'Size bir vaka atandı' : 'Size bir görev atandı',
      message: `${actor.name ? `${actor.name}: ` : ''}${title.replace(/\s+/g, ' ').trim().slice(0, 140)}`,
      type: 'info',
      data: {
        type: kind === 'incident' ? 'incident_assigned' : 'task_assigned',
        module: kind === 'incident' ? 'incidents' : 'action_items',
        ctaPath,
        ...(kind === 'incident' ? { incidentId: entityId } : { actionItemId: entityId }),
      },
    },
  });
}
