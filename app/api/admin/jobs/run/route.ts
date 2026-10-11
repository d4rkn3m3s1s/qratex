/**
 * POST /api/admin/jobs/run { name, reason } — bu dönem başarılı koşusu olmayan bir işi orkestratör
 * üzerinden şimdi çalıştırır (kadans zorlama yok). Gerekçeli, denetimli, sıkı hız sınırlı.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { runJobBodySchema } from '@/lib/observability/contract';
import { runJobNow } from '@/lib/observability/jobs.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = defineRoute(
  {
    name: 'admin.jobs.run',
    roles: ['ADMIN'],
    schema: runJobBodySchema,
    rateLimit: { max: 6, windowMs: 10 * 60_000, by: 'user' },
  },
  async ({ body, session, request }) =>
    ok(await runJobNow(body, actorFromSession(session as Parameters<typeof actorFromSession>[0]), request))
);
