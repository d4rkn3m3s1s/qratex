/**
 * PATCH  /api/dealer/automation/replies/[id] — kuralı düzenle (tam gövde, aynı şema).
 * DELETE /api/dealer/automation/replies/[id] — onaylı silme; anlık görüntü döner ("Geri al").
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { deleteReplyRule, updateReplyRule } from '@/lib/dealer-automation/replies.server';
import { replyRuleBodySchema } from '@/lib/dealer-automation/reply-rules';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

export const PATCH = defineRoute(
  {
    name: 'dealer.automation.replies.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    params,
    schema: replyRuleBodySchema,
    rateLimit: 'mutation',
    maxBodyBytes: 16 * 1024,
  },
  async ({ tenant, params: p, body }) => ok(await updateReplyRule({ dealerId: tenant.dealerId, actorId: tenant.actorId }, p.id, body))
);

export const DELETE = defineRoute(
  { name: 'dealer.automation.replies.delete', roles: ['DEALER'], tenant: 'dealer', params, rateLimit: 'mutation' },
  async ({ tenant, params: p }) => ok(await deleteReplyRule({ dealerId: tenant.dealerId, actorId: tenant.actorId }, p.id))
);
