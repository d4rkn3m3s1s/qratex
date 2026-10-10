/**
 * POST /api/customer/wallet/rewards/claim — puanla ödül al (Cüzdan → Ödüller).
 *
 * Varsayılan reddet: yalnız CUSTOMER; `rewards` modül kapısı; zod gövde; `Idempotency-Key`
 * ile yanıt tekrarı + defterde tek-kez anahtarı (çift dokunuş / ağ yeniden denemesi çift
 * borç yaratmaz). Kişi başı limit kullanıcı satırı kilidi altında sayılır (yarış yok).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { claimReward } from '@/lib/wallet-rewards/mutations';
import { rethrowAsApiError } from '@/lib/wallet-rewards/http';
import { assertCustomerModule } from '@/lib/customer-wallet/gate';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ rewardId: z.string().trim().min(1).max(64) });

export const POST = defineRoute(
  {
    name: 'customer.wallet.rewards.claim',
    roles: ['CUSTOMER'],
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
    schema: bodySchema,
    idempotent: true,
  },
  async ({ body, user, request }) => {
    await assertCustomerModule('rewards', null, { userId: user.id, request, routeKey: 'customer.wallet.rewards.claim' });
    try {
      const result = await claimReward({
        userId: user.id,
        rewardId: body.rewardId,
        requestKey: request.headers.get('idempotency-key'),
        audit: getAuditRequestMeta(request),
      });
      return ok(result);
    } catch (err) {
      rethrowAsApiError(err);
    }
  }
);
