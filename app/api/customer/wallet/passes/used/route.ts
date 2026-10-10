/**
 * POST /api/customer/wallet/passes/used — müşteri kendi ödül kodunu "kullandım" olarak
 * işaretler (tek yön). Bayi kasası kodu `POST /api/dealer/reward-codes` ile tüketir.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { markPassUsed } from '@/lib/wallet-rewards/mutations';
import { rethrowAsApiError } from '@/lib/wallet-rewards/http';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ userRewardId: z.string().trim().min(1).max(64) });

export const POST = defineRoute(
  {
    name: 'customer.wallet.passes.used',
    roles: ['CUSTOMER'],
    rateLimit: 'mutation',
    schema: bodySchema,
  },
  async ({ body, user }) => {
    try {
      return ok(await markPassUsed({ userId: user.id, userRewardId: body.userRewardId }));
    } catch (err) {
      rethrowAsApiError(err);
    }
  }
);
