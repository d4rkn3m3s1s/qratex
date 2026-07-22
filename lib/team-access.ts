import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

/**
 * Ekip modülü erişimi — ADMIN erişimi GEREKTİRMEZ. Herhangi bir giriş yapmış kullanıcı,
 * kendisine bir ekip rolü (adminTeamRole) atanmışsa ekip paneline erişebilir.
 * Rol atama/yönetim işlemleri (yönetici) için `manager: true` istenir.
 */
export async function requireTeamAccess(opts?: { manager?: boolean }) {
  const auth = await requireAuth(['ADMIN', 'DEALER', 'CUSTOMER', 'STAFF']);
  if ('error' in auth) return { error: auth.error };

  const sessionRole = (auth.session.user as { adminTeamRole?: string | null }).adminTeamRole ?? null;
  // Session bayat olabilir; DB'den güncel rolü doğrula.
  const user = await prisma.user.findUnique({
    where: { id: auth.session.user.id },
    select: { adminTeamRole: true, adminDepartment: true, role: true },
  });
  const teamRole = user?.adminTeamRole ?? sessionRole;
  // ADMIN her zaman erişir (kurulum/yönetim için). Diğerleri yalnızca ekip rolü varsa.
  const isAdmin = user?.role === 'ADMIN';
  const hasAccess = isAdmin || !!teamRole;

  if (!hasAccess) {
    return { error: NextResponse.json({ success: false, error: 'Ekip erişiminiz yok.' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS }) };
  }
  const isManager = isAdmin || teamRole === 'yonetici';
  if (opts?.manager && !isManager) {
    return { error: NextResponse.json({ success: false, error: 'Bu işlem için yönetici olmalısınız.' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS }) };
  }
  return { session: auth.session, teamRole, department: user?.adminDepartment ?? null, isManager, isAdmin };
}
