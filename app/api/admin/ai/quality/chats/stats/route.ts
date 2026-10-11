/** GET /api/admin/ai/quality/chats/stats — hacim, sonuç dağılımı, p50/p95 gecikme, en aktif aktörler, saklama süresi. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { chatStatsQuerySchema } from '@/lib/ai-quality/contract';
import { getChatStats } from '@/lib/ai-quality/chats.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.ai.quality.chats.stats', roles: ['ADMIN'], query: chatStatsQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await getChatStats(query))
);
