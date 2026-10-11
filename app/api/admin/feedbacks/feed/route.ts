/**
 * GET /api/admin/feedbacks/feed — platform geri bildirim akışı (QR ∪ tüketim yorumu),
 * veritabanında birleşik sayfalama, filtre, arama ve sıralama.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { feedQuerySchema } from '@/lib/admin-feedbacks/contract';
import { listFeed } from '@/lib/admin-feedbacks/feed.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.feedbacks.feed', roles: ['ADMIN'], query: feedQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listFeed(query))
);
