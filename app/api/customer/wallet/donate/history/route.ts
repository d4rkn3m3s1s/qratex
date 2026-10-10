import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getDonationHistory } from '@/lib/customer-wallet/donate/service';

export const dynamic = 'force-dynamic';

const Query = z.object({ cursor: z.string().max(200).optional() });

/**
 * GET /api/customer/wallet/donate/history — kullanıcının kendi bağışları (makbuzlar), imleçli.
 * Modül kapalı olsa da geçmiş görünür kalır: kullanıcının kendi harcama kaydıdır.
 */
export const GET = defineRoute(
  { name: 'customer.wallet.donate.history', roles: ['CUSTOMER'], query: Query, rateLimit: 'read' },
  async ({ user, query }) => ok(await getDonationHistory(prisma, user.id, query.cursor ?? null)),
);
