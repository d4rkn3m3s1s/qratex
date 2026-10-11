/** GET /api/admin/trust/audit — hassas yönetici işlemleri (aktör + IP; gürültülü olaylar dışlanır). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { SensitiveAuditQuery } from '@/lib/admin-trust/contract';
import { listSensitiveAudit } from '@/lib/admin-trust/trust.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.trust.audit.list', roles: ['ADMIN'], query: SensitiveAuditQuery, rateLimit: 'read' },
  async ({ query }) => ok(await listSensitiveAudit(query))
);
