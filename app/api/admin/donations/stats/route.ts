/** GET /api/admin/donations/stats — filtreden bağımsız KPI'lar + 30 günlük İstanbul serisi + şeffaf toplam/defter uzlaşması. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { getDonationStats } from '@/lib/admin-donations/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.donations.stats', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getDonationStats(prisma)));
