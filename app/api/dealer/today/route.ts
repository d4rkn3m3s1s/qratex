/**
 * `GET /api/dealer/today` — Bayi "Bugün" BFF'i (yol haritası §4.3: dashboard + copilot +
 * operasyon özeti + kurulum kartı tek yüzeyde).
 *
 * Sayfa ilk render'ı aynı yükleyiciyle sunucuda yapar; bu uç tazeleme ("Yenile", sekmeye
 * dönüş, yazma sonrası) içindir. `?fresh=1` 30 sn'lik önbelleği atlar.
 *
 * Varsayılan reddet: DEALER (kendi işletmesi) ve ADMIN (yalnız `?dealerId=` ile, salt-okunur);
 * kiracı kapsamı `resolveDealerScope`. GET yan etkisizdir ve LLM çağırmaz.
 */
import { z } from 'zod';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { DealerTodayNotFoundError, loadDealerToday } from '@/lib/dealer-today/load';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.today',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'read',
    query: z.object({ fresh: z.enum(['0', '1']).optional(), dealerId: z.string().optional() }),
  },
  async ({ tenant, query }) => {
    try {
      return ok(await loadDealerToday(tenant.dealerId, { fresh: query.fresh === '1' }));
    } catch (error) {
      if (error instanceof DealerTodayNotFoundError) throw new ApiError('NOT_FOUND', 'İşletme bulunamadı.');
      throw error;
    }
  }
);
