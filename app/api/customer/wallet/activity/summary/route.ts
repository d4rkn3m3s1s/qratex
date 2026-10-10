import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getSpendSummary } from '@/lib/customer-wallet/activity/spend-summary';
import { assertCustomerModule } from '@/lib/customer-wallet/gate';
import { SUMMARY_RANGES } from '@/lib/customer-wallet/periods';

export const dynamic = 'force-dynamic';

const Query = z.object({ range: z.enum(SUMMARY_RANGES).optional().default('month') });

/**
 * GET /api/customer/wallet/activity/summary?range=month|quarter|year|all
 * Harcama özeti — Europe/Istanbul kovaları, önceki döneme göre değişim, defterden kazanç.
 * Modül kapısı `spending_overview` (admin kapatınca API de kapanır — denetim B2).
 * Önbellek yok: her istek taze (QR sonrası yeni ziyaret hemen görünür — denetim B11).
 */
export const GET = defineRoute(
  { name: 'customer.wallet.activity.summary', roles: ['CUSTOMER'], query: Query, rateLimit: 'read' },
  async ({ user, query, request }) => {
    await assertCustomerModule('spending_overview', null, { userId: user.id, request, routeKey: '/customer/wallet/activity' });
    return ok(await getSpendSummary(prisma, user.id, query.range));
  },
);
