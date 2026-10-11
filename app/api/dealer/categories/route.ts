import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/categories — kategoriler (global + bu işletmeye özel).
 *
 * Kiracı `defineRoute({ tenant: 'dealer' })` ile çözülür (mimari-api B2): DEALER kendisi,
 * STAFF bağlı olduğu AKTİF işletme, ADMIN yalnız açık `?dealerId=` ile (salt-okunur). Eskiden
 * ADMIN kendi kullanıcı kimliğini bayi sayıyordu.
 */
export const GET = defineRoute(
  { name: 'dealer.categories.list', roles: ['DEALER', 'STAFF', 'ADMIN'], tenant: 'dealer', rateLimit: 'read' },
  async ({ tenant }) => {
    const dealerId = tenant.dealerId;
    const categories = await prisma.productCategory.findMany({
      where: { OR: [{ dealerId: null }, { dealerId }], isActive: true },
      take: 500,
      orderBy: { order: 'asc' },
      include: {
        // Yalnız bu bayinin + sistemin AKTİF ürünleri (tüm bayilerin ürünleri sayılmaz).
        _count: {
          select: { products: { where: { isActive: true, OR: [{ dealerId }, { dealerId: null }] } } },
        },
      },
    });
    return ok({ categories }, { legacySpread: true });
  }
);

// Yazma: POST /api/dealer/catalog/categories (defineRoute; aynı ad 409, simge doğrulamalı).
