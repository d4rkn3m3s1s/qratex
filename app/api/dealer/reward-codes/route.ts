/**
 * Bayi kasası — müşterinin ödül kodunu doğrula (GET) ve tek kullanımla tüket (POST).
 *
 * Ödül teslim zincirinin son halkası (denetim raporu customer_rewards Bulgu 1): eskiden puanla
 * alınan kod hiçbir yerde doğrulanamıyor ve "kullanıldı" işaretlenemiyordu. Tüketim atomik
 * (`updateMany where claimedAt: null`); ikinci okutma 409 PASS_ALREADY_USED. Denetim izi +
 * müşteriye bildirim aynı transaction'da.
 *
 * Ödüller platform geneli (Reward modelinde işletme yok) → kod her işletmede geçerlidir.
 * Kiracı kapsamı (`tenant: 'dealer'`) kimin tükettiğini denetim izine yazar.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { lookupRewardCode, redeemRewardCodeAtDealer } from '@/lib/wallet-rewards/mutations';
import { rethrowAsApiError } from '@/lib/wallet-rewards/http';

export const dynamic = 'force-dynamic';

const code = z.string().trim().min(6).max(40);

export const GET = defineRoute(
  {
    name: 'dealer.reward-codes.lookup',
    roles: ['DEALER', 'STAFF'],
    tenant: 'dealer',
    rateLimit: { max: 30, windowMs: 60_000, by: 'user' },
    query: z.object({ code }),
  },
  async ({ query }) => {
    try {
      return ok(await lookupRewardCode(query.code));
    } catch (err) {
      rethrowAsApiError(err);
    }
  }
);

export const POST = defineRoute(
  {
    name: 'dealer.reward-codes.redeem',
    roles: ['DEALER', 'STAFF'],
    tenant: 'dealer',
    rateLimit: { max: 30, windowMs: 60_000, by: 'user' },
    schema: z.object({ code }),
    idempotent: true,
  },
  async ({ body, tenant, user, request }) => {
    try {
      return ok(
        await redeemRewardCodeAtDealer({
          code: body.code,
          dealerId: tenant.dealerId,
          actorId: user.id,
          audit: getAuditRequestMeta(request),
        })
      );
    } catch (err) {
      rethrowAsApiError(err);
    }
  }
);
