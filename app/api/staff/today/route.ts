import { defineRoute, ok } from '@/lib/http/define-route';
import { getStaffToday } from '@/lib/staff-ops/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/staff/today — personel "Bugün" ekranının tek BFF'i: aktif/bugünkü/sıradaki vardiya,
 * açık görevler (sınırsız değil ama 200'e kadar, öncelik sıralı), bugünün kontrol listeleri,
 * bana atanan vakalar/aksiyonlar, eğitim, izin, saha bildirimlerim, müşteri geri bildirimim.
 * Pasif personel `requireAuth` + kiracı çözümünde 403 alır.
 */
export const GET = defineRoute(
  {
    name: 'staff.today',
    roles: ['STAFF'],
    tenant: { kind: 'dealer', allowRoles: ['STAFF'] },
    rateLimit: 'read',
  },
  async ({ tenant, user }) => ok(await getStaffToday(user.id, tenant.dealerId))
);
