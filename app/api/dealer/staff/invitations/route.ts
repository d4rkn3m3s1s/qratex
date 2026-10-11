import { assertModuleEnabled } from '@/lib/module-gate';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { listPendingInvitations } from '@/lib/staff-invitations';

export const dynamic = 'force-dynamic';

/** GET /api/dealer/staff/invitations — bayinin bekleyen (kabul/iptal edilmemiş, süresi dolmamış) davetleri. */
export async function GET() {
  try {
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return auth.error;
    // staff_management modülü kapalıysa uç da kapalı (yalnız menüde değil).
    const moduleGate = await assertModuleEnabled('staff_management', { role: 'dealer' }).catch(() => null);
    if (moduleGate) return moduleGate;
    const limited = await enforceRouteRateLimit('dealer.staff.invitations.list', auth.session.user.id, 'read');
    if (limited) return limited;
    const invitations = await listPendingInvitations(auth.session.user.id);
    return NextResponse.json({ success: true, invitations }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Staff invitations GET:', error);
    return NextResponse.json(
      { success: false, error: 'Davetler yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
