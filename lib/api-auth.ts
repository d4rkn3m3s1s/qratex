/**
 * Server-side auth helpers for API routes.
 * All routes under /api/admin, /api/dealer, /api/customer MUST use requireAuth(allowedRoles)
 * and enforce resource ownership (requireDealerResource / requireUserResource) where applicable.
 */
import { getServerSession } from 'next-auth';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { checkTokenReplay } from '@/lib/token-replay';
import { getClientIp, getUserAgent } from '@/lib/request-metadata';
import type { Session } from 'next-auth';

type AllowedRole = 'ADMIN' | 'DEALER' | 'CUSTOMER' | 'STAFF';

/**
 * Get session or return 401. Use in API routes for server-side auth.
 */
export async function getSessionOr401(): Promise<Session | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return session;
}

/**
 * Enforce role(s). Call after getSessionOr401. Returns 403 response if role not allowed.
 */
export function requireRole(
  session: Session,
  allowedRoles: AllowedRole[]
): NextResponse | null {
  const role = session.user?.role as string | undefined;
  if (!role || !allowedRoles.includes(role as AllowedRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/**
 * Require session and role in one call. Returns { session } or { error: NextResponse }.
 * Token replay: aynı JWT farklı IP/UA ile kullanılırsa 403 + alarm.
 */
export async function requireAuth(
  allowedRoles?: AllowedRole[]
): Promise<
  | { session: Session }
  | { error: NextResponse }
> {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return { error: session };
  if (allowedRoles?.length) {
    const forbidden = requireRole(session, allowedRoles);
    if (forbidden) return { error: forbidden };
  }
  const jti = (session as { jti?: string }).jti;
  if (jti) {
    const headersList = await headers();
    const ip = getClientIp({ headers: headersList }) || 'unknown';
    const ua = getUserAgent({ headers: headersList }) || '';
    const replay = await checkTokenReplay(jti, ip, ua);
    if (!replay.ok) {
      return {
        error: NextResponse.json(
          { error: 'Session güvenlik ihlali tespit edildi. Lütfen tekrar giriş yapın.' },
          { status: 403 }
        ),
      };
    }
  }
  return { session };
}

/**
 * Dealer resource check: only ADMIN or the owning dealer can access.
 */
export function requireDealerResource(
  session: Session,
  resourceDealerId: string
): NextResponse | null {
  const role = session.user?.role as string | undefined;
  const userId = session.user?.id;
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (role === 'ADMIN') return null;
  if (role === 'DEALER' && resourceDealerId === userId) return null;
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * User resource check: only ADMIN or the owning user can access.
 */
export function requireUserResource(
  session: Session,
  resourceUserId: string
): NextResponse | null {
  const role = session.user?.role as string | undefined;
  const userId = session.user?.id;
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (role === 'ADMIN') return null;
  if (resourceUserId === userId) return null;
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Dealer scope for Prisma where: use in all dealer-scoped queries.
 * ADMIN: pass undefined to query any; DEALER: pass { dealerId: session.user.id }.
 */
export function dealerScopeWhere(
  session: Session
): { dealerId: string } | Record<string, never> {
  const role = session.user?.role as string | undefined;
  const userId = session.user?.id;
  if (!userId || role === 'ADMIN') return {};
  if (role === 'DEALER') return { dealerId: userId };
  return {};
}

/**
 * User scope for Prisma where: use in all customer-scoped queries.
 * ADMIN: pass undefined to query any; CUSTOMER: pass { userId: session.user.id }.
 */
export function userScopeWhere(
  session: Session
): { userId: string } | Record<string, never> {
  const role = session.user?.role as string | undefined;
  const userId = session.user?.id;
  if (!userId || role === 'ADMIN') return {};
  if (role === 'CUSTOMER') return { userId };
  return {};
}

/**
 * Staff: get dealerId from session. STAFF must have dealerId (employer).
 * Returns dealerId or 403 response.
 */
export function getStaffDealerId(session: Session): string | NextResponse {
  const role = session.user?.role as string | undefined;
  const dealerId = (session.user as { dealerId?: string }).dealerId;
  if (role !== 'STAFF' || !dealerId) {
    return NextResponse.json(
      { error: role === 'STAFF' ? 'Personel bu işletmeye bağlı değil' : 'Forbidden' },
      { status: 403 }
    );
  }
  return dealerId;
}
