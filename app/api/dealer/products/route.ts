import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dealer/products?categoryId= — aktif ürünler (global + bu işletmeye özel).
 *
 * Kiracı `defineRoute({ tenant: 'dealer' })` ile çözülür (mimari-api B2): DEALER kendisi,
 * STAFF bağlı olduğu AKTİF işletme, ADMIN yalnız açık `?dealerId=` ile (salt-okunur). Eskiden
 * ADMIN kendi kullanıcı kimliğini bayi sayıyordu.
 */
const querySchema = z.object({
  categoryId: z.string().trim().min(1).max(64).optional(),
  dealerId: z.string().optional(),
});

export const GET = defineRoute(
  { name: 'dealer.products.list', roles: ['DEALER', 'STAFF', 'ADMIN'], tenant: 'dealer', query: querySchema, rateLimit: 'read' },
  async ({ tenant, query }) => {
    const products = await prisma.product.findMany({
      where: {
        OR: [{ dealerId: null }, { dealerId: tenant.dealerId }],
        isActive: true,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      },
      orderBy: { name: 'asc' },
      take: 500,
      include: { category: { select: { id: true, name: true, icon: true } } },
    });
    return ok({ products }, { legacySpread: true });
  }
);

// Yazma: /api/dealer/catalog/products (defineRoute; kuruş fiyat, görsel alanı, aynı ad 409).
