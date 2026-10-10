import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import {
  getPendingShelf,
  getReviewRewardPreview,
  getVisitStats,
  getVisitsPage,
  type ReviewFilter,
} from '@/lib/customer-wallet/activity/visits';

export const dynamic = 'force-dynamic';

const Query = z.object({
  cursor: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  review: z.enum(['all', 'pending', 'reviewed']).optional(),
  /** Eski derin bağlantı uyumu: `?hasReview=false` (bekleyen) · `true` (yorumlanan). */
  hasReview: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(80).optional(),
  dealer: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

function resolveReview(review: ReviewFilter | undefined, hasReview: 'true' | 'false' | undefined): ReviewFilter {
  if (review) return review;
  if (hasReview === 'false') return 'pending';
  if (hasReview === 'true') return 'reviewed';
  return 'all';
}

/**
 * GET /api/customer/wallet/activity/visits — ziyaret (tüketim) listesi, imleçli.
 * İlk sayfada (imleçsiz) filtreden BAĞIMSIZ `stats`, yorum ödülü önizlemesi (`reward`) ve
 * bekleyenler rafı (`pendingShelf`) da döner. Sonraki sayfalarda yalnız `items`.
 */
export const GET = defineRoute(
  { name: 'customer.wallet.activity.visits', roles: ['CUSTOMER'], query: Query, rateLimit: 'read' },
  async ({ user, query }) => {
    const review = resolveReview(query.review, query.hasReview);
    const firstPage = !query.cursor;
    const [page, stats, reward, pendingShelf] = await Promise.all([
      getVisitsPage(prisma, user.id, { cursor: query.cursor ?? null, review, q: query.q ?? null, dealerId: query.dealer ?? null, limit: query.limit }),
      firstPage ? getVisitStats(prisma, user.id) : Promise.resolve(null),
      firstPage ? getReviewRewardPreview(prisma, user.id) : Promise.resolve(null),
      firstPage ? getPendingShelf(prisma, user.id) : Promise.resolve(null),
    ]);
    return ok({ ...page, review, stats, reward, pendingShelf });
  },
);
