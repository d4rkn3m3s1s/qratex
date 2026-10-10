/**
 * POST /api/customer/wallet/cosmetics/purchase — kozmetik satın al (Cüzdan → Ödüller → Kozmetik).
 *
 * Pasif/arşivli ürün satın alınamaz; istemcinin gördüğü fiyat (`expectedPrice`) sunucudakiyle
 * eşleşmezse 409 PRICE_CHANGED; zaten sahipse 409 ALREADY_OWNED (eskiden yarışta 500).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { purchaseCosmetic } from '@/lib/wallet-rewards/mutations';
import { rethrowAsApiError } from '@/lib/wallet-rewards/http';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  cosmeticId: z.string().trim().min(1).max(64),
  expectedPrice: z.number().int().min(0).max(10_000_000),
});

export const POST = defineRoute(
  {
    name: 'customer.wallet.cosmetics.purchase',
    roles: ['CUSTOMER'],
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
    schema: bodySchema,
    idempotent: true,
  },
  async ({ body, user }) => {
    try {
      return ok(await purchaseCosmetic({ userId: user.id, cosmeticId: body.cosmeticId, expectedPrice: body.expectedPrice }));
    } catch (err) {
      rethrowAsApiError(err);
    }
  }
);
