/** POST /api/dealer/automation/replies/reorder — değerlendirme sırası (ilk eşleşen kural çalışır). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { reorderReplyRules } from '@/lib/dealer-automation/replies.server';
import { replyReorderSchema } from '@/lib/dealer-automation/reply-rules';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.automation.replies.reorder',
    roles: ['DEALER'],
    tenant: 'dealer',
    schema: replyReorderSchema,
    rateLimit: 'mutation',
    maxBodyBytes: 8 * 1024,
  },
  async ({ tenant, body }) => ok(await reorderReplyRules({ dealerId: tenant.dealerId, actorId: tenant.actorId }, body.ids))
);
