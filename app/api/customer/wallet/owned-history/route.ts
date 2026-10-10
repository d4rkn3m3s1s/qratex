/**
 * GET /api/customer/wallet/owned-history?kind=boxes|passes&cursor= — Ödüllerim geçmişinin
 * sonraki sayfası (açılmış kutular / kullanılmış kodlar). Saf okuma, kullanıcı kapsamlı.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { listOpenedBoxes, listUsedPasses } from '@/lib/wallet-rewards/queries';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  kind: z.enum(['boxes', 'passes']),
  cursor: z.string().trim().min(1).max(64).optional(),
});

export const GET = defineRoute(
  {
    name: 'customer.wallet.owned-history',
    roles: ['CUSTOMER'],
    rateLimit: 'read',
    query: querySchema,
  },
  async ({ query, user }) => {
    const cursor = query.cursor ?? null;
    const page = query.kind === 'boxes' ? await listOpenedBoxes(user.id, cursor) : await listUsedPasses(user.id, cursor);
    return ok(page);
  }
);
