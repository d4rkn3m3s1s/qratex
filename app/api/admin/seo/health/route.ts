/**
 * /api/admin/seo/health
 *  GET: son kaydedilmiş sağlık raporu (dış istek yok).
 *  POST: kontrolleri çalıştırır (dış istek yalnız uygulamanın kendi alan adına) ve sonucu kalıcı yazar.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { getLastSeoHealth, runSeoHealth } from '@/lib/admin-seo/seo.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.seo.health.last', roles: ['ADMIN'], rateLimit: 'read' },
  async () => ok({ report: await getLastSeoHealth() })
);

export const POST = defineRoute(
  { name: 'admin.seo.health.run', roles: ['ADMIN'], rateLimit: { max: 6, windowMs: 60_000, by: 'user-or-ip' } },
  async ({ session, request }) => ok({ report: await runSeoHealth({ actor: actorFromSession(session), request }) })
);
