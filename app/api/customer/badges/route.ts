import { defineRoute } from '@/lib/http/define-route';
import { loadCustomerBadgeCollection } from '@/lib/badges/customer-collection';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/badges — müşterinin rozet koleksiyonu (yüzey: `/customer/me/badges`).
 *
 * Yalnız CUSTOMER ve DAİMA oturumdaki kullanıcı: `userId` parametresi KABUL EDİLMEZ (eski
 * `/api/gamification/badges?userId=` IDOR sınıfı bu uçta yapısal olarak yok). Yanıt yalnız
 * KAZANILMIŞ rozetleri taşır (tam sürpriz); "keşfedilecek rozet var" tek bir boolean'dır.
 *
 * Gövde: zarf v2 → `data: CollectionOverview` (lib/badges/collection-logic.ts).
 * GET'te LLM yok; hiçbir şey yazmaz.
 */
export const GET = defineRoute(
  {
    name: 'customer.badges.overview',
    roles: ['CUSTOMER'],
    rateLimit: 'read',
  },
  async ({ user }) => loadCustomerBadgeCollection(user.id),
);
