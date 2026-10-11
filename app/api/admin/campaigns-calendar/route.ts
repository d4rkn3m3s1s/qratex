/** GET /api/admin/campaigns-calendar?from=&days= — iki katmanlı zaman çizelgesi (kampanya + konsept), çakışmalar, canlı özet. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { calendarQuerySchema } from '@/lib/campaigns-calendar/contract';
import { loadCalendar } from '@/lib/campaigns-calendar/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.campaigns-calendar.get', roles: ['ADMIN'], query: calendarQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await loadCalendar({ from: query.from, days: query.days }))
);
