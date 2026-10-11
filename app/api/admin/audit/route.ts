/** GET /api/admin/audit — denetim günlüğü (özet alanlar, imleçli, süzgeçli; veri gövdesi detay ucunda). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { auditListQuerySchema } from '@/lib/admin-audit/contract';
import { listAudit } from '@/lib/admin-audit/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.audit.list', roles: ['ADMIN'], query: auditListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listAudit(prisma, query))
);
