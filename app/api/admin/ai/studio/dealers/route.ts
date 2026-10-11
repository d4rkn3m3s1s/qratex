/** GET /api/admin/ai/studio/dealers — bayi AI politikası + öğrenme profili özeti (User tabanlı, sayfalı, aranır). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { dealerListQuerySchema } from '@/lib/ai-studio/contract';
import { listDealers } from '@/lib/ai-studio/dealers.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.ai-studio.dealers', roles: ['ADMIN'], query: dealerListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listDealers(query))
);
