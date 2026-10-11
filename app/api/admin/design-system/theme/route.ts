/**
 * GET /api/admin/design-system/theme — canlı tema (saklı değer, geçerlilik, sürüm, son yayınlayan, mevsimsel konsept).
 * PUT /api/admin/design-system/theme — taslağı yayınla: zod (aile id'si | custom, #RRGGBB, varsayılan mod),
 *   tek transaction + iyimser kilit (409) + tek denetim kaydı + anında önbellek tazeleme; yanıt yeni satırları döndürür.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { PublishThemeBody } from '@/lib/design-system/theme-schemas';
import { getThemeOverview, publishTheme } from '@/lib/design-system/theme.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.designSystem.theme.get', roles: ['ADMIN'], rateLimit: 'read' }, async () =>
  ok(await getThemeOverview())
);

export const PUT = defineRoute(
  { name: 'admin.designSystem.theme.publish', roles: ['ADMIN'], schema: PublishThemeBody, rateLimit: 'mutation', maxBodyBytes: 16_000 },
  async ({ body, session, request }) => ok(await publishTheme(actionCtx(session, request), body))
);
