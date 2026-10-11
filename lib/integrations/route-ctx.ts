import type { Session } from 'next-auth';
import type { Ctx } from './server';

/** defineRoute bağlamından servis bağlamı (aktör anlık görüntüsü + istek meta). */
export function ctxFrom(session: Session, request: Ctx['request']): Ctx {
  const u = session.user as { id: string; email?: string | null; role?: string | null; name?: string | null };
  return { actor: { id: u.id, email: u.email ?? null, role: u.role ?? null, name: u.name ?? null }, request };
}
