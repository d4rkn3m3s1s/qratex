/**
 * GET /api/admin/inbox/[id]/body[?images=1] — mail gövdesini çerçevede göstermek için HTML belge.
 * Güvenlik HTTP BAŞLIĞIYLA: `Content-Security-Policy` (yalnız yükseklik betiğinin özeti, uzak görsel
 * varsayılan kapalı, CSP sandbox) + `nosniff`. Ayrıntı: lib/mail-center/mail-html.ts.
 */
import { z } from 'zod';
import { defineRoute } from '@/lib/http/define-route';
import { buildMailFrameDocument, mailFrameCsp } from '@/lib/mail-center/mail-html';
import { getMessageBody } from '@/lib/mail-center/inbox.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'admin.inbox.body',
    roles: ['ADMIN'],
    params: z.object({ id: z.string().min(1).max(40) }),
    query: z.object({ images: z.enum(['0', '1']).optional() }),
    rateLimit: 'read',
  },
  async ({ params, query }) => {
    const body = await getMessageBody(params.id);
    return new Response(buildMailFrameDocument(body), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': mailFrameCsp(query.images === '1'),
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'private, no-store',
      },
    });
  }
);
