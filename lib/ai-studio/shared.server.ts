/** Stüdyo sunucu modülleri için ortak yardımcılar (aktör, denetim, sürüm çakışması). */
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { VERSION_CONFLICT_CODE, VERSION_CONFLICT_MESSAGE, isVersionConflictError } from '@/lib/settings-version';
import type { ActorRef } from './contract';

export type RequestLike = { headers: { get(name: string): string | null } } | null | undefined;

export function actorRef(actor: AuditActor): ActorRef {
  return { id: actor.id, name: actor.name ?? null, email: actor.email ?? null };
}

export function conflictError(currentVersion: string): ApiError {
  return new ApiError(VERSION_CONFLICT_CODE, VERSION_CONFLICT_MESSAGE, { status: 409, details: { currentVersion } });
}

/** `writeVersionedSetting` çakışmasını zarf v2'nin 409'una çevirir. */
export async function mapVersionConflict<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isVersionConflictError(err)) throw conflictError(err.currentVersion);
    throw err;
  }
}

export function auditData(
  actor: AuditActor,
  input: { action: string; entity: string; entityId?: string | null; oldData?: unknown; newData?: unknown },
  request: RequestLike
): Prisma.AuditLogUncheckedCreateInput {
  return auditEntry(actor, input, request ?? null);
}

/** Denetim satırındaki aktör anlık görüntüsünden ActorRef. */
export function actorFromSnapshot(userId: string | null, snapshot: unknown, user?: { name: string | null; email: string | null } | null): ActorRef | null {
  const s = (snapshot && typeof snapshot === 'object' ? snapshot : {}) as { name?: unknown; email?: unknown };
  const name = typeof s.name === 'string' ? s.name : user?.name ?? null;
  const email = typeof s.email === 'string' ? s.email : user?.email ?? null;
  if (!userId && !name && !email) return null;
  return { id: userId, name, email };
}

export function iso(d: Date | null | undefined): string | null {
  return d instanceof Date ? d.toISOString() : null;
}

export function newId(prefix: string): string {
  const rnd = randomBytes(4).toString('hex');
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}
