import { defineRoute, ok } from '@/lib/http/define-route';
import { listRemedyOffers } from '@/lib/dealer-queues/remedy-server';

export const dynamic = 'force-dynamic';

/**
 * Eski "onay bekleyen telafiler" ucu — geriye uyumlu takma ad.
 * Yeni yüzey: Gelen Kutusu → Telafi onayı (`/dealer/inbox/remedy`, BFF
 * `/api/dealer/queues/remedy`). Modül kapısı + kiracı kapsamı + açık DTO (ham kullanıcı
 * kimliği ve e-posta dönmez; müşteri adı sunucuda üretilir).
 */
export const GET = defineRoute(
  {
    name: 'dealer.remedy-queue.list',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'remedy_offers',
    rateLimit: 'read',
  },
  async ({ tenant }) => {
    const page = await listRemedyOffers(tenant.dealerId, { view: 'awaiting', source: 'all', q: '', cursor: null, limit: 50 });
    return ok({ offers: page.items, nextCursor: page.nextCursor }, { legacySpread: true });
  }
);
