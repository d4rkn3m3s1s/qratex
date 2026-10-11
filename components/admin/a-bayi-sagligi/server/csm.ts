/**
 * CSM görevleri — churn-playbook cron'unun yazdığı ama hiçbir yerde okunmayan `CSMTask` artık
 * Bayi Sağlığı çekmecesinde görünür ve yönetilir (denetim envanter #30). Her yazım `AuditLog`'a
 * iz bırakır; silme yok (çözülen görev kapanır, kayıt kalır).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import type { CsmPriority, CsmStatus, HealthWindow } from '../domain';
import { normalizeCsmStatus } from '../domain';
import { loadAllRows } from './list';

export interface CsmActor {
  id: string;
  role: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function audit(tx: Prisma.TransactionClient, actor: CsmActor, action: string, entityId: string, oldData: unknown, newData: unknown) {
  return tx.auditLog.create({
    data: {
      userId: actor.id,
      actorType: 'user',
      actorSnapshot: { role: actor.role } as Prisma.InputJsonValue,
      action,
      entity: 'CSMTask',
      entityId,
      oldData: (oldData ?? undefined) as Prisma.InputJsonValue | undefined,
      newData: (newData ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
    },
  });
}

export interface CreateCsmInput {
  priority: CsmPriority;
  note: string;
  dueAt?: string | null;
  assignToMe?: boolean;
  window: HealthWindow;
}

export async function createCsmTask(dealerId: string, input: CreateCsmInput, actor: CsmActor) {
  const dealer = await prisma.user.findFirst({ where: { id: dealerId, role: 'DEALER' }, select: { id: true } });
  if (!dealer) throw new ApiError('NOT_FOUND', 'Bayi bulunamadı.');

  // Görev, açıldığı andaki sağlık skorunu ve önerileri taşır (sonradan kıyas için).
  const { rows } = await loadAllRows(input.window);
  const row = rows.find((r) => r.dealerId === dealerId) ?? null;

  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new ApiError('VALIDATION', 'Son tarih geçersiz.');

  return prisma.$transaction(async (tx) => {
    const task = await tx.cSMTask.create({
      data: {
        dealerId,
        type: 'manual',
        status: 'open',
        priority: input.priority,
        healthScore: row?.score ?? null,
        suggestedActions: row
          ? (row.recommendations.map((r) => ({ kind: r.kind, id: r.id, priority: r.priority })) as Prisma.InputJsonValue)
          : undefined,
        assignedToId: input.assignToMe ? actor.id : null,
        dueAt,
        metadata: { note: input.note, source: 'admin_dealers_health', window: input.window } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await audit(tx, actor, 'csm_task.create', task.id, null, {
      dealerId,
      priority: input.priority,
      healthScore: row?.score ?? null,
      assignedToMe: !!input.assignToMe,
    });
    return task;
  });
}

export interface UpdateCsmInput {
  status?: CsmStatus;
  assignToMe?: boolean;
  /** İyimser kilit: istemcinin gördüğü durum. Farklıysa 409. */
  expectedStatus?: CsmStatus;
}

export async function updateCsmTask(taskId: string, input: UpdateCsmInput, actor: CsmActor) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.cSMTask.findUnique({ where: { id: taskId }, select: { id: true, status: true, assignedToId: true, dealerId: true } });
    if (!current) throw new ApiError('NOT_FOUND', 'Görev bulunamadı.');
    const from = normalizeCsmStatus(current.status);
    if (input.expectedStatus && input.expectedStatus !== from) {
      throw new ApiError('CONFLICT', 'Görev bu arada başka biri tarafından güncellendi. Liste yenilendi.');
    }
    const data: Prisma.CSMTaskUpdateInput = {};
    if (input.status && input.status !== from) {
      data.status = input.status;
      data.resolvedAt = input.status === 'resolved' ? new Date() : null;
    }
    if (input.assignToMe !== undefined) {
      data.assignedTo = input.assignToMe ? { connect: { id: actor.id } } : { disconnect: true };
    }
    if (Object.keys(data).length === 0) throw new ApiError('BAD_REQUEST', 'Değişiklik yok.');
    const updated = await tx.cSMTask.update({ where: { id: taskId }, data, select: { id: true, status: true, dealerId: true } });
    await audit(
      tx,
      actor,
      'csm_task.update',
      taskId,
      { status: from, assignedToId: current.assignedToId },
      { status: updated.status, assignToMe: input.assignToMe ?? null }
    );
    return updated;
  });
}
