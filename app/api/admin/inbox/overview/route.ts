/** GET /api/admin/inbox/overview — görünüm sayaçları + son senkron durumu + yapılandırma + saklama süresi. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { loadInboxOverview } from '@/lib/mail-center/inbox.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.inbox.overview', roles: ['ADMIN'], rateLimit: 'read' },
  async () => ok(await loadInboxOverview())
);
