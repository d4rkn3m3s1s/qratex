/**
 * GET /api/admin/users/catalog?kind=badges|rewards|admins — aksiyon diyaloglarının seçenekleri.
 * Yalnız ilgili diyalog açıldığında çekilir (her filtre değişiminde değil). Rozetlerde gizli ve
 * karakter rozetleri dahildir (admin modu); ödüllerde yalnız etkin ve stoğu olanlar.
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getBadgeCatalog, getRewardCatalog } from '@/lib/admin-users/detail.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'admin.users.catalog',
    roles: ['ADMIN'],
    query: z.object({ kind: z.enum(['badges', 'rewards', 'admins']) }),
    rateLimit: 'read',
  },
  async ({ query, user }) => {
    if (query.kind === 'badges') return ok({ items: await getBadgeCatalog() });
    if (query.kind === 'rewards') return ok({ items: await getRewardCatalog() });
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', suspendedAt: null, anonymizedAt: null, id: { not: user.id } },
      orderBy: { name: 'asc' },
      take: 200,
      select: { id: true, name: true, email: true },
    });
    return ok({ items: admins });
  }
);
