import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { bulkSchema } from '@/lib/admin-games/contract';
import { bulkSetEnabled } from '@/lib/admin-games/server';

export const dynamic = 'force-dynamic';

/** POST /api/admin/games/bulk — seçili oyunları gerekçeyle toplu kapat/aç (acil durdurma). Her oyun ayrı audit satırı. */
export const POST = defineRoute(
  { name: 'admin.games.bulk', roles: ['ADMIN'], rateLimit: 'mutation', schema: bulkSchema },
  async ({ request, user, body }) => ok(await bulkSetEnabled(user.id, body, getAuditRequestMeta(request)))
);
