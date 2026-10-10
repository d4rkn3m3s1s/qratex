/**
 * POST /api/customer/wallet/boxes/daily — bugünün (Europe/Istanbul) günlük kutusunu oluşturur.
 *
 * Eskiden kutu `GET /api/surprise-box` yan etkisiyle (önbellek ısıtma, prefetch, bot ziyareti
 * dahil) ve UTC gününe göre üretiliyordu. Artık yalnız müşteri "Aç" dediğinde, modül kapısı
 * arkasında; aynı gün ikinci kutu `@@unique([userId, dayKey])` ile imkânsız.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { ensureDailyBox } from '@/lib/wallet-rewards/mutations';
import { rethrowAsApiError } from '@/lib/wallet-rewards/http';
import { assertCustomerModule } from '@/lib/customer-wallet/gate';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'customer.wallet.boxes.daily',
    roles: ['CUSTOMER'],
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
  },
  async ({ user, request }) => {
    await assertCustomerModule('surprise_boxes', null, { userId: user.id, request, routeKey: 'customer.wallet.boxes.daily' });
    try {
      return ok(await ensureDailyBox({ userId: user.id }));
    } catch (err) {
      rethrowAsApiError(err);
    }
  }
);
