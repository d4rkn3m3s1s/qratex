/**
 * `GET /api/customer/home` — Müşteri Ana Sayfa BFF'i (§4.3, F3.1(b)).
 *
 * Tek istekte: bakiye + seviye + sonraki ödül, seri (haftalık şerit), günlük 3 hedef,
 * bekleyen işler, lig şeridi (DB lig kuralları + aynı metrikle sıra), çark durumu,
 * günlük kutu. Sayfa ilk render'ı aynı yükleyiciyle sunucuda yapar; bu uç yalnız
 * mutasyon sonrası tazeleme ve SSR başarısız olduğunda kullanılır.
 *
 * Varsayılan reddet: yalnız CUSTOMER; yetki DB'den (`requireAuth`); okuma rate limiti.
 * GET yan etkisizdir (seri dokunuşu `POST /api/customer/streak`).
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { CustomerHomeNotFoundError, loadCustomerHome } from '@/lib/customer-home/load';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'customer.home', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user }) => {
    try {
      return ok(await loadCustomerHome(user.id));
    } catch (error) {
      if (error instanceof CustomerHomeNotFoundError) throw new ApiError('NOT_FOUND', 'Hesap bulunamadı.');
      throw error;
    }
  }
);
