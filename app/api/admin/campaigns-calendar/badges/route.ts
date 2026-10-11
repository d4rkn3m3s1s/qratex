/** GET — görev ödülü için seçilebilir (etkin, arşivsiz) rozetler. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { listBadgeOptions } from '@/lib/campaigns-calendar/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.campaigns-calendar.badges', roles: ['ADMIN'], rateLimit: 'read' },
  async () => ok({ badges: await listBadgeOptions() })
);
