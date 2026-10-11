/**
 * GET /api/admin/council/config — konsey ayarları + AI sağlayıcı durumu + değişiklik geçmişi + kazanan dağılımı.
 * PUT /api/admin/council/config — { config, expectedUpdatedAt } (zod; uyuşmazlıkta 409; denetim kaydı).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { configPutSchema } from '@/lib/council/contract';
import { getCouncilSettings, updateCouncilConfig } from '@/lib/council/config.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.council.config.get', roles: ['ADMIN'], rateLimit: 'read' }, async () =>
  ok(await getCouncilSettings())
);

export const PUT = defineRoute(
  { name: 'admin.council.config.put', roles: ['ADMIN'], schema: configPutSchema, rateLimit: 'mutation' },
  async ({ body, session, request }) => {
    await updateCouncilConfig(body, actorFromSession(session), request);
    return ok(await getCouncilSettings());
  }
);
