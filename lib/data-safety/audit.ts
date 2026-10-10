/**
 * Denetim izi satırı üretici — aktör anlık görüntüsüyle (P0-25).
 *
 * `AuditLog.userId` artık nullable + `onDelete: SetNull`: aktör hesabı silinse ya da
 * anonimleşse de kim olduğu `actorSnapshot`'ta kalır. Veri koruma uçları (arşiv,
 * anonimleştirme, demo araçları) bu yardımcıyı kullanır ki her satır aynı biçimde olsun.
 *
 *   await tx.auditLog.create({ data: auditEntry(actorFromSession(session), { action, entity, entityId, oldData }, request) });
 */
import type { Prisma } from '@prisma/client';
import { getAuditRequestMeta } from '@/lib/request-metadata';

export interface AuditActor {
  id: string | null;
  email?: string | null;
  role?: string | null;
  name?: string | null;
  /** user | system | cron */
  type?: 'user' | 'system' | 'cron';
}

interface SessionLike {
  user: { id: string; email?: string | null; role?: string | null; name?: string | null };
}

export function actorFromSession(session: SessionLike): AuditActor {
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    role: session.user.role ?? null,
    name: session.user.name ?? null,
    type: 'user',
  };
}

export const SYSTEM_ACTOR: AuditActor = { id: null, type: 'system' };

export interface AuditInput {
  action: string;
  entity: string;
  entityId?: string | null;
  oldData?: unknown;
  newData?: unknown;
}

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  // Date/BigInt vb. güvenli biçimde JSON'a indirgenir.
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? val.toString() : val))) as Prisma.InputJsonValue;
}

export function auditEntry(
  actor: AuditActor,
  input: AuditInput,
  request?: { headers: { get(name: string): string | null } } | null
): Prisma.AuditLogUncheckedCreateInput {
  const meta = request ? getAuditRequestMeta(request) : { ipAddress: null, userAgent: null };
  return {
    userId: actor.id,
    actorType: actor.type ?? 'user',
    actorSnapshot: toJson({ email: actor.email ?? null, role: actor.role ?? null, name: actor.name ?? null }),
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    oldData: toJson(input.oldData),
    newData: toJson(input.newData),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  };
}
