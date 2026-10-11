/** PUT /api/admin/inbox/settings — gelen kutusu saklama süresi (KVKK). Varsayılan kapalı; denetimli. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { inboxSettingsSchema } from '@/lib/mail-center/inbox-contract';
import { saveRetentionDays } from '@/lib/mail-center/inbox.server';

export const dynamic = 'force-dynamic';

export const PUT = defineRoute(
  { name: 'admin.inbox.settings', roles: ['ADMIN'], schema: inboxSettingsSchema, rateLimit: 'mutation' },
  async ({ body, session, request }) =>
    ok({ retentionDays: await saveRetentionDays({ days: body.retentionDays, session, meta: getAuditRequestMeta(request) }) })
);
