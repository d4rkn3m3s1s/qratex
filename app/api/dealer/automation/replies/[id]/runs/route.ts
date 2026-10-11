/** GET /api/dealer/automation/replies/[id]/runs — kuralın son tetiklenmeleri (yanıt / vaka). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadReplyRuns } from '@/lib/dealer-automation/replies.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.automation.replies.runs',
    roles: ['DEALER'],
    tenant: 'dealer',
    params: z.object({ id: z.string().min(1).max(64) }),
    rateLimit: 'read',
  },
  async ({ tenant, params: p }) => ok({ runs: await loadReplyRuns(tenant.dealerId, p.id) })
);
