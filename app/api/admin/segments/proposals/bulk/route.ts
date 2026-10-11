/** POST /api/admin/segments/proposals/bulk — toplu karar (en fazla 50); her satır aynı koşullu kurala tabi, satır bazlı sonuç. */
import { defineRoute } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { bulkDecide } from '@/components/admin/a-segmentler/server/proposals';
import { BulkDecideBody } from '@/components/admin/a-segmentler/server/schemas';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.segments.proposals.bulk', roles: ['ADMIN'], schema: BulkDecideBody, rateLimit: { max: 10, windowMs: 60_000, by: 'user' } },
  async ({ body, user, request }) => {
    const meta = getAuditRequestMeta(request);
    return bulkDecide(body.ids, { decision: body.decision, note: body.note }, { id: user.id, role: user.role, ...meta });
  }
);
