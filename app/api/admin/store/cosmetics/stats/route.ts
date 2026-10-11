/** GET /api/admin/store/cosmetics/stats — satışta/kapalı/arşiv, 30 gün satış + yakılan puan (defter), en çok satan, eksik demo. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getCosmeticStats } from '@/lib/admin-store/cosmetics.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.store.cosmetics.stats', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getCosmeticStats()));
