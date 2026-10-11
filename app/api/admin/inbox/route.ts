/**
 * GET /api/admin/inbox?view=&q=&cursor= — gelen kutusu listesi (görünüm + arama + imleçli sayfalama).
 * Senkron `POST /api/admin/inbox/sync`, sayaçlar ve senkron durumu `GET /api/admin/inbox/overview`.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { inboxListQuerySchema } from '@/lib/mail-center/inbox-contract';
import { listInbox } from '@/lib/mail-center/inbox.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.inbox.list', roles: ['ADMIN'], query: inboxListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listInbox({ view: query.view, q: query.q, cursor: query.cursor ?? null }))
);
