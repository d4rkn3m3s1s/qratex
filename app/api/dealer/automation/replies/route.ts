/**
 * GET  /api/dealer/automation/replies — kurallar + sayaçlar + üsluplar + AI durumu.
 * POST /api/dealer/automation/replies — yeni kural (ayrık birleşim koşul, 20 sınırı kilit altında).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { createReplyRule, loadRepliesOverview } from '@/lib/dealer-automation/replies.server';
import { replyRuleBodySchema } from '@/lib/dealer-automation/reply-rules';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'dealer.automation.replies.list', roles: ['DEALER'], tenant: 'dealer', rateLimit: 'read' },
  async ({ tenant }) => ok(await loadRepliesOverview(tenant.dealerId))
);

export const POST = defineRoute(
  {
    name: 'dealer.automation.replies.create',
    roles: ['DEALER'],
    tenant: 'dealer',
    schema: replyRuleBodySchema,
    rateLimit: 'mutation',
    idempotent: true,
    maxBodyBytes: 16 * 1024,
  },
  async ({ tenant, body }) => ok(await createReplyRule({ dealerId: tenant.dealerId, actorId: tenant.actorId }, body), { status: 201 })
);
