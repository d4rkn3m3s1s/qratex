/** GET /api/admin/pages/[id]/history — sürüm geçmişi (kim, ne zaman, hangi alanlar; sürüm editöre yüklenebilir). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getCmsHistory } from '@/lib/cms-pages/pages.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.pages.history', roles: ['ADMIN'], params: z.object({ id: z.string().min(1).max(64) }), rateLimit: 'read' },
  async ({ params: p }) => ok(await getCmsHistory(p.id))
);
