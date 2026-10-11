/** GET /api/admin/intern-emails/sends?templateId=&cursor= — şablonun gönderim geçmişi (sayfalı, kim/ne zaman). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadSendHistory } from '@/lib/mail-center/templates.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'admin.intern-emails.sends',
    roles: ['ADMIN'],
    query: z.object({ templateId: z.string().min(1).max(64), cursor: z.string().max(40).optional() }),
    rateLimit: 'read',
  },
  async ({ query }) => ok(await loadSendHistory(query.templateId, query.cursor ?? null))
);
