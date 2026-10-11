/** GET /api/admin/squads/audit — Klan Merkezi moderasyon günlüğü (Squad + SquadBattle denetim kayıtları). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { listSquadAudit } from '@/lib/admin-squads/server';

export const dynamic = 'force-dynamic';

const query = z.object({
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  size: z.coerce.number().int().min(10).max(100).catch(25),
});

export const GET = defineRoute(
  { name: 'admin.squads.audit', roles: ['ADMIN'], query, rateLimit: 'read' },
  async ({ query: q }) => ok(await listSquadAudit(q.page, q.size))
);
