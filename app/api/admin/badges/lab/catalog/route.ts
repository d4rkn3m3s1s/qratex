/** GET /api/admin/badges/lab/catalog — karakter kataloğu sağlığı (kademe, ödül, reveal metni, kayıt, sahip). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getLabCatalog } from '@/lib/admin-badges/lab.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.badges.lab.catalog', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getLabCatalog()));
