/**
 * GET /api/admin/ai/studio/models — görev sınıfı başına etkin model + 7 gün kullanım.
 * PUT /api/admin/ai/studio/models — model seçimi (katalog denetimli, sürüm kontrollü, gerekçeli denetim).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { modelRoutingSchema } from '@/lib/ai-studio/contract';
import { getModelsState, updateModelRouting } from '@/lib/ai-studio/models.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.ai-studio.models', roles: ['ADMIN'], rateLimit: 'read' }, async () => ok(await getModelsState()));

export const PUT = defineRoute(
  { name: 'admin.ai-studio.models.update', roles: ['ADMIN'], schema: modelRoutingSchema, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await updateModelRouting(body, actorFromSession(session), request))
);
