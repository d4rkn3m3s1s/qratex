import { defineRoute, ok } from '@/lib/http/define-route';
import { personalCandidatesQuerySchema } from '@/lib/dealer/offers/rules';
import { searchPersonalCandidates } from '@/lib/dealer/offers/mutations.server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/offers/personal/candidates?q= — kişiye özel teklif için müşteri seçici.
 * Yalnız bu işletmenin müşterileri (bayi kapsamlı istatistik), en yeni ziyaret önce, en fazla 20.
 * Her aday ulaşılabilirlik (kampanya bildirimi açık mı) ve açık teklif bilgisiyle döner.
 */
export const GET = defineRoute(
  {
    name: 'dealer.offers.personal.candidates',
    roles: ['DEALER'],
    tenant: { kind: 'dealer', allowRoles: ['DEALER'] },
    module: 'remedy_offers',
    query: personalCandidatesQuerySchema,
    rateLimit: { max: 60, windowMs: 60_000, by: 'user' },
  },
  async ({ query, tenant }) => ok({ candidates: await searchPersonalCandidates(tenant.dealerId, query.q) })
);
