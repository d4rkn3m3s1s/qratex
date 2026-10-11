import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { INPUT_LIMITS } from '@/lib/input-limits';

export const dynamic = 'force-dynamic';

/**
 * GET /api/search?q= — panel başlığındaki komut paletinin veri araması (admin/bayi/müşteri).
 *
 * Rol başına KAPSAM (varsayılan reddet — mimari-api B1/B2):
 *  - ADMIN: kullanıcılar, tüm geri bildirimler, ürünler, QR kodları.
 *  - DEALER: yalnız kendi geri bildirimleri/ürünleri (+ global ürünler)/QR kodları.
 *  - CUSTOMER: yalnız kendi geri bildirimleri + aktif ürün adları.
 * Eskiden rol listesiz `requireAuth()` vardı: STAFF (ve ileride eklenecek her rol) ne bayi ne
 * müşteri filtresine düşüp BÜTÜN işletmelerin geri bildirim metinlerini görüyordu. Artık rol
 * listesi açık; STAFF'ın paneli bu paleti kullanmaz → 403.
 */
const LIMIT_PER_TYPE = 5;

const querySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim().slice(0, INPUT_LIMITS.searchQuery)),
});

type Results = {
  users: { id: string; name: string | null; email: string; businessName: string | null; role: string; href: string }[];
  feedbacks: { id: string; text: string | null; rating: number; sentiment: string | null; createdAt: string; href: string }[];
  products: { id: string; name: string; categoryName?: string; href: string }[];
  qrCodes: { id: string; name: string; code: string; businessName: string | null; href: string }[];
};

const EMPTY: Results = { users: [], feedbacks: [], products: [], qrCodes: [] };

export const GET = defineRoute(
  { name: 'search.global', roles: ['ADMIN', 'DEALER', 'CUSTOMER'], query: querySchema, rateLimit: 'read' },
  async ({ query, user }) => {
    const q = query.q;
    if (q.length < 2) return ok({ results: EMPTY }, { legacySpread: true });

    const role = user.role as 'ADMIN' | 'DEALER' | 'CUSTOMER';
    const isAdmin = role === 'ADMIN';
    const searchContains = { contains: q, mode: 'insensitive' as const };
    // Kapsam filtresi rol başına AÇIK; bilinmeyen rol buraya hiç gelmez (roles listesi).
    const feedbackScope = isAdmin ? {} : role === 'DEALER' ? { qrCode: { dealerId: user.id } } : { userId: user.id };
    const productScope = role === 'DEALER' ? { OR: [{ dealerId: user.id }, { dealerId: null }] } : {};
    const enc = encodeURIComponent(q);

    const [usersResult, feedbacksResult, productsResult, qrCodesResult] = await Promise.all([
      isAdmin
        ? prisma.user.findMany({
            where: { OR: [{ name: searchContains }, { email: searchContains }, { businessName: searchContains }] },
            take: LIMIT_PER_TYPE,
            select: { id: true, name: true, email: true, businessName: true, role: true },
          })
        : Promise.resolve([]),
      prisma.feedback.findMany({
        where: {
          deletedAt: null,
          text: { not: null },
          OR: [
            { text: searchContains },
            ...(isAdmin ? [{ user: { name: searchContains } }, { user: { email: searchContains } }] : []),
          ],
          ...feedbackScope,
        },
        take: LIMIT_PER_TYPE,
        orderBy: { createdAt: 'desc' },
        select: { id: true, text: true, rating: true, sentiment: true, createdAt: true },
      }),
      prisma.product.findMany({
        where: { isActive: true, name: searchContains, ...productScope },
        take: LIMIT_PER_TYPE,
        select: { id: true, name: true, category: { select: { name: true } } },
      }),
      role === 'ADMIN' || role === 'DEALER'
        ? prisma.qRCode.findMany({
            where: {
              isActive: true,
              OR: [
                { name: searchContains },
                { code: searchContains },
                ...(isAdmin ? [{ dealer: { businessName: searchContains } }, { dealer: { name: searchContains } }] : []),
              ],
              ...(role === 'DEALER' ? { dealerId: user.id } : {}),
            },
            take: LIMIT_PER_TYPE,
            select: { id: true, name: true, code: true, dealer: { select: { businessName: true, name: true } } },
          })
        : Promise.resolve([]),
    ]);

    const feedbackHref = isAdmin
      ? `/admin/feedbacks?search=${enc}`
      : role === 'DEALER'
        ? `/dealer/inbox?search=${enc}`
        : `/customer/me/voices?search=${enc}`;
    const productHref = isAdmin
      ? `/admin/feedbacks?search=${enc}`
      : role === 'DEALER'
        ? `/dealer/products?search=${enc}`
        : `/customer/wallet/activity?search=${enc}`;

    const results: Results = {
      users: usersResult.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        businessName: u.businessName,
        role: u.role,
        href: `/admin/users?id=${u.id}`,
      })),
      feedbacks: feedbacksResult.map((fb) => ({
        id: fb.id,
        text: fb.text?.slice(0, 80) ?? null,
        rating: fb.rating,
        sentiment: fb.sentiment,
        createdAt: fb.createdAt.toISOString(),
        href: feedbackHref,
      })),
      products: productsResult.map((pr) => ({
        id: pr.id,
        name: pr.name,
        categoryName: pr.category?.name,
        href: productHref,
      })),
      qrCodes: qrCodesResult.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        businessName: c.dealer?.businessName ?? c.dealer?.name ?? null,
        href: `/dealer/qr-codes?search=${enc}`,
      })),
    };
    return ok({ results }, { legacySpread: true });
  }
);
