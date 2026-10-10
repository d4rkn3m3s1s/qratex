/**
 * Kuyruk denetim izi — görev ve vaka geçişleri `AuditLog`'a yazılır (şema değişikliği gerekmez).
 * Detay çekmecesindeki zaman çizelgesi buradan okunur: kim, ne zaman, neyi değiştirdi.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type QueueAuditEntity = 'Incident' | 'ActionItem';

export interface QueueActor {
  id: string | null;
  name: string | null;
  role: string;
}

export const SYSTEM_ACTOR: QueueActor = { id: null, name: null, role: 'SYSTEM' };

export interface QueueAuditEntry {
  action: string;
  entity: QueueAuditEntity;
  entityId: string;
  data?: Record<string, unknown>;
}

type AuditDb = { auditLog: Pick<Prisma.TransactionClient['auditLog'], 'createMany'> };

export async function writeQueueAudit(db: AuditDb, actor: QueueActor, entries: QueueAuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await db.auditLog.createMany({
    data: entries.map((e) => ({
      userId: actor.id,
      actorType: actor.id ? 'user' : 'system',
      actorSnapshot: { name: actor.name, role: actor.role } as Prisma.InputJsonValue,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      newData: (e.data ?? {}) as Prisma.InputJsonValue,
    })),
  });
}

export interface QueueAuditRow {
  id: string;
  action: string;
  createdAt: Date;
  actorName: string | null;
  actorType: string;
  data: Record<string, unknown>;
}

export async function readQueueAudit(entity: QueueAuditEntity, entityId: string, take = 60): Promise<QueueAuditRow[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: 'asc' },
    take,
    select: { id: true, action: true, createdAt: true, actorType: true, actorSnapshot: true, newData: true },
  });
  return rows.map((r) => {
    const snap = r.actorSnapshot && typeof r.actorSnapshot === 'object' && !Array.isArray(r.actorSnapshot)
      ? (r.actorSnapshot as Record<string, unknown>)
      : {};
    const data = r.newData && typeof r.newData === 'object' && !Array.isArray(r.newData)
      ? (r.newData as Record<string, unknown>)
      : {};
    return {
      id: r.id,
      action: r.action,
      createdAt: r.createdAt,
      actorName: typeof snap.name === 'string' && snap.name ? snap.name : null,
      actorType: r.actorType,
      data,
    };
  });
}
