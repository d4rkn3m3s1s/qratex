/** GET /api/admin/pricing/console — Plan konsolu: planlar (arşiv dahil), abone/MRR, Stripe durumu. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getPricingOverview } from '@/lib/admin-pricing/pricing.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.pricing.console', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getPricingOverview()));
