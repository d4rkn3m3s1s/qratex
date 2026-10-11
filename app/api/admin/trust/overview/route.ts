/** GET /api/admin/trust/overview — Güven Merkezi KPI'ları (sunucu hesaplar; hata görünür, sıfıra düşmez). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getOverview } from '@/lib/admin-trust/trust.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.trust.overview', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getOverview()));
