/**
 * POST /api/dealer/automation/replies/preview — kaydedilmemiş koşulun son 30 günde hangi
 * geri bildirimlere uyacağı (motorla aynı eşleştirici; yalnız okuma, LLM yok).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { previewReplyCondition } from '@/lib/dealer-automation/replies.server';
import { replyPreviewSchema } from '@/lib/dealer-automation/reply-rules';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'dealer.automation.replies.preview',
    roles: ['DEALER'],
    tenant: 'dealer',
    schema: replyPreviewSchema,
    rateLimit: { max: 40, windowMs: 60_000, by: 'user-or-ip' },
    maxBodyBytes: 4 * 1024,
  },
  async ({ tenant, body }) => ok(await previewReplyCondition(tenant.dealerId, body.condition))
);
