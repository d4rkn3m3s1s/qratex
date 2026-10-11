/** GET /api/admin/discovery/history — keşif ayarı sürümleri (denetim kaydından); taslağa yüklenebilir. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { historyQuerySchema } from '@/lib/admin-discovery/contract';
import { getHistory } from '@/lib/admin-discovery/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.discovery.history', roles: ['ADMIN'], query: historyQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await getHistory(prisma, query.page))
);
