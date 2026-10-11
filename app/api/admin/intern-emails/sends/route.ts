/**
 * GET  /api/admin/intern-emails/sends?templateId=&cursor= — şablonun gönderim geçmişi (sayfalı, kim/ne zaman).
 * POST /api/admin/intern-emails/sends { action: 'revert-bounce', email } — alıcının bounce işaretlerini geri alır.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadSendHistory } from '@/lib/mail-center/templates.server';
import { revertBounces } from '@/lib/mail-center/bounce';
import { writeMailAudit } from '@/lib/mail-center/audit.server';
import { getAuditRequestMeta } from '@/lib/request-metadata';

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

export const POST = defineRoute(
  {
    name: 'admin.intern-emails.revert-bounce',
    roles: ['ADMIN'],
    schema: z.object({ action: z.literal('revert-bounce'), email: z.string().trim().email().max(320) }),
    rateLimit: 'mutation',
  },
  async ({ body, session, request }) => {
    const reverted = await revertBounces(body.email);
    await writeMailAudit({
      session,
      action: 'REVERT_EMAIL_BOUNCE',
      entity: 'InternEmailSend',
      entityId: body.email.toLowerCase(),
      newData: { reverted },
      meta: getAuditRequestMeta(request),
    });
    return ok({ reverted });
  }
);
