/** GET /api/admin/seo/audit — SEO sürüm geçmişi: alan bazlı fark, sayfalı (ham JSON dönmez). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { seoHistoryQuerySchema } from '@/lib/admin-seo/contract';
import { listSeoHistory } from '@/lib/admin-seo/seo.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.seo.history', roles: ['ADMIN'], query: seoHistoryQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listSeoHistory({ cursor: query.cursor, limit: query.limit }))
);
