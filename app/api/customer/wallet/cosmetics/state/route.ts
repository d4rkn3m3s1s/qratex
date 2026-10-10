/**
 * POST /api/customer/wallet/cosmetics/state — kuşan / çıkar (çerçeve, arka plan) ve
 * vitrine sabitle / kaldır (rozet dahil; rozetlerle ortak 4 slot).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { setCosmeticState } from '@/lib/wallet-rewards/mutations';
import { rethrowAsApiError } from '@/lib/wallet-rewards/http';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  cosmeticId: z.string().trim().min(1).max(64),
  action: z.enum(['equip', 'unequip', 'pin', 'unpin']),
});

export const POST = defineRoute(
  {
    name: 'customer.wallet.cosmetics.state',
    roles: ['CUSTOMER'],
    rateLimit: 'mutation',
    schema: bodySchema,
  },
  async ({ body, user }) => {
    try {
      return ok(await setCosmeticState({ userId: user.id, cosmeticId: body.cosmeticId, action: body.action }));
    } catch (err) {
      rethrowAsApiError(err);
    }
  }
);
