/** GET /api/admin/platform-settings/history — ayar değişiklik geçmişi (imleçli sayfalama). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { listPlatformHistory } from '@/lib/platform-settings/server';

export const dynamic = 'force-dynamic';

const Query = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const GET = defineRoute(
  { name: 'admin.platformSettings.history', roles: ['ADMIN'], query: Query, rateLimit: 'read' },
  async ({ query }) => ok(await listPlatformHistory({ cursor: query.cursor ?? null, limit: query.limit ?? 20 }))
);
