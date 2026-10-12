import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { cachedJson } from '@/lib/redis';
import { defineRoute, ok } from '@/lib/http/define-route';
import { INPUT_LIMITS } from '@/lib/input-limits';
import { feedbackHref, productHref, qrHref, userHref, cardHref } from '@/lib/navigation/search-targets';

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
 *
 * İniş adresleri (`lib/navigation/search-targets.ts`, B4c): her sonuç KENDİ kaydına iner
 * (Kullanıcı 360, gelen kutusu detay çekmecesi, Seslerim kaydı, bayinin sağlık çekmecesi).
 * Rolün o tür için yüzeyi yoksa (admin ürün) tür hiç sorgulanmaz — eskiden admin ürün sonucu
 * geri bildirim listesine, admin QR sonucu erişemediği bayi sayfasına iniyordu.
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
  cards: { id: string; token: string; status: string; customerName: string | null; href: string }[];
  feedbacks: { id: string; text: string | null; rating: number; sentiment: string | null; createdAt: string; href: string }[];
  products: { id: string; name: string; categoryName?: string; href: string }[];
  qrCodes: { id: string; name: string; code: string; businessName: string | null; href: string }[];
};

const EMPTY: Results = { users: [], feedbacks: [], products: [], qrCodes: [], cards: [] };

export const GET = defineRoute(
  { name: 'search.global', roles: ['ADMIN', 'DEALER', 'CUSTOMER'], query: querySchema, rateLimit: 'read' },
  async ({ query, user }) => {
    const q = query.q;
    if (q.length < 2) return ok({ results: EMPTY }, { legacySpread: true });
    // Komut paleti her tuşta (debounce sonrası) arar; aynı kişi + aynı sorgu 30 sn Redis'ten
    // döner (perf O6 ara çözüm — kalıcı çözüm pg_trgm GIN, SCHEMA-REQUESTS). Anahtar kullanıcıya
    // ve role özgü: kapsamı farklı iki kişi birbirinin sonucunu göremez.
    const cacheKey = `search:v2:${user.id}:${user.role}:${createHash('sha1').update(q).digest('hex')}`;
    const results = await cachedJson<Results>(cacheKey, 30, async () => {
      const role = user.role as 'ADMIN' | 'DEALER' | 'CUSTOMER';
      const isAdmin = role === 'ADMIN';
      const searchContains = { contains: q, mode: 'insensitive' as const };
      // Kapsam filtresi rol başına AÇIK; bilinmeyen rol buraya hiç gelmez (roles listesi).
      const feedbackScope = isAdmin ? {} : role === 'DEALER' ? { qrCode: { dealerId: user.id } } : { userId: user.id };
      // Müşteri: yalnız kendi tükettiği ürünler (iniş: o ürünü içeren ziyaretleri) — tüm platform
      // kataloğundan sonuç gösterip boş listeye indirmek yok.
      const productScope =
        role === 'DEALER'
          ? { OR: [{ dealerId: user.id }, { dealerId: null }] }
          : role === 'CUSTOMER'
            ? { consumptions: { some: { customerId: user.id } } }
            : {};
      const searchProducts = productHref(role, 'x') !== null;

      const [usersResult, feedbacksResult, productsResult, qrCodesResult, cardsResult] = await Promise.all([
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
        searchProducts
          ? prisma.product.findMany({
              where: { isActive: true, name: searchContains, ...productScope },
              take: LIMIT_PER_TYPE,
              select: { id: true, name: true, category: { select: { name: true } } },
            })
          : Promise.resolve([]),
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
              select: { id: true, name: true, code: true, dealerId: true, dealer: { select: { businessName: true, name: true } } },
            })
          : Promise.resolve([]),
        // Kart token'ı yalnız admin için; kısa sorgu tüm kartları taramasın diye ≥4 karakter.
        isAdmin && q.length >= 4
          ? prisma.physicalCard.findMany({
              where: { archivedAt: null, token: searchContains },
              take: LIMIT_PER_TYPE,
              orderBy: { createdAt: 'desc' },
              select: { id: true, token: true, status: true, customer: { select: { name: true, email: true } } },
            })
          : Promise.resolve([]),
      ]);

      const computed: Results = {
        users: usersResult.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          businessName: u.businessName,
          role: u.role,
          href: userHref(role, u.id) ?? `/admin/users?id=${encodeURIComponent(u.id)}`,
        })),
        feedbacks: feedbacksResult.map((fb) => ({
          id: fb.id,
          text: fb.text?.slice(0, 80) ?? null,
          rating: fb.rating,
          sentiment: fb.sentiment,
          createdAt: fb.createdAt.toISOString(),
          href: feedbackHref(role, fb.id),
        })),
        products: productsResult.flatMap((pr) => {
          const href = productHref(role, pr.name);
          return href ? [{ id: pr.id, name: pr.name, categoryName: pr.category?.name, href }] : [];
        }),
        qrCodes: qrCodesResult.flatMap((c) => {
          const href = qrHref(role, { code: c.code, dealerId: c.dealerId });
          return href
            ? [{ id: c.id, name: c.name, code: c.code, businessName: c.dealer?.businessName ?? c.dealer?.name ?? null, href }]
            : [];
        }),
        cards: cardsResult.flatMap((c) => {
          const href = cardHref(role, c.token);
          return href ? [{ id: c.id, token: c.token, status: c.status, customerName: c.customer?.name ?? c.customer?.email ?? null, href }] : [];
        }),
      };
      return computed;
    });

    return ok({ results }, { legacySpread: true });
  }
);
