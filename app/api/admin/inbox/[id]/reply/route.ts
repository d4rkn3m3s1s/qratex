/**
 * POST /api/admin/inbox/[id]/reply — { message, quote? }. Alıcı/konu/thread başlıkları sunucuda,
 * orijinal mesajdan kurulur (istemciden başlık kabul edilmez). Giden yanıt kaydedilir + denetim.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { inboxReplySchema } from '@/lib/mail-center/inbox-contract';
import { replyToMessage } from '@/lib/mail-center/inbox.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = defineRoute(
  {
    name: 'admin.inbox.reply',
    roles: ['ADMIN'],
    params: z.object({ id: z.string().min(1).max(40) }),
    schema: inboxReplySchema,
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
    idempotent: true,
  },
  async ({ params, body, session, request }) =>
    ok(
      await replyToMessage({ id: params.id, message: body.message, quote: body.quote, session, meta: getAuditRequestMeta(request) }),
      { status: 201 }
    )
);
