/** PATCH /api/dealer/automation/replies/[id]/state — kuralı durdur / başlat. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { setReplyRuleActive } from '@/lib/dealer-automation/replies.server';
import { replyRuleStateSchema } from '@/lib/dealer-automation/reply-rules';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute(
  {
    name: 'dealer.automation.replies.state',
    roles: ['DEALER'],
    tenant: 'dealer',
    params: z.object({ id: z.string().min(1).max(64) }),
    schema: replyRuleStateSchema,
    rateLimit: 'mutation',
    maxBodyBytes: 1024,
  },
  async ({ tenant, params: p, body }) =>
    ok(await setReplyRuleActive({ dealerId: tenant.dealerId, actorId: tenant.actorId }, p.id, body.isActive))
);
