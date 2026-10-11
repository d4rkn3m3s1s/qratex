/** GET /api/admin/squads/options?q= — savaş planlama için hafif, aranabilir klan seçici (PII yok). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { squadOptionsQuerySchema } from '@/lib/admin-squads/contract';
import { squadOptions } from '@/lib/admin-squads/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.squads.options', roles: ['ADMIN'], query: squadOptionsQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok({ items: await squadOptions(query.q) })
);
