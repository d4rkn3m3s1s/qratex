/**
 * Test yardımcısı: oturum (next-auth `getServerSession` + `requireAuth`) sahtesi.
 *
 *   jest.mock('next-auth', () => require('../helpers/session-mock').nextAuthMock);
 *   jest.mock('@/lib/api-auth', () => require('../helpers/session-mock').apiAuthMock);
 *   setSession(as('dealer-a', 'DEALER'));
 *
 * `requireAuth(roles)` gerçek sözleşmeyi taklit eder: oturumsuz 401, rol listede değilse 403.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

let current: any = null;

export function setSession(session: any): void {
  current = session;
}

export function as(id: string, role: string, extra: Record<string, unknown> = {}): any {
  return { user: { id, role, email: `${id}@test.local`, ...extra }, expires: '2099-01-01' };
}

export const getServerSession = jest.fn(async () => current);

export async function requireAuth(roles?: string[]) {
  if (!current?.user?.id) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 }) };
  }
  if (roles?.length && !roles.includes(current.user.role)) {
    return { error: NextResponse.json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 }) };
  }
  return { session: current };
}

/** `getOptionalSession` sözleşmesi: geçerli oturum ya da null (asla hata yanıtı). */
export async function getOptionalSession() {
  return current?.user?.id ? current : null;
}

export const ANY_SIGNED_IN_ROLE = ['ADMIN', 'DEALER', 'STAFF', 'CUSTOMER'];

export const nextAuthMock = { getServerSession: (...args: unknown[]) => (getServerSession as any)(...args) };
export const apiAuthMock = {
  requireAuth: (...args: any[]) => requireAuth(...args),
  getOptionalSession: () => getOptionalSession(),
  ANY_SIGNED_IN_ROLE,
  STAFF_INACTIVE_CODE: 'STAFF_INACTIVE',
};
