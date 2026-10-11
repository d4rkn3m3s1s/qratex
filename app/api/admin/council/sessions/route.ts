/**
 * GET  /api/admin/council/sessions — oturum geçmişi (imleçli sayfalama, arama, durum filtresi + sayaçlar).
 * POST /api/admin/council/sessions — yeni oturum: kapsam + ayar anlık görüntüsü + veri paketi; LLM çağrısı YOK.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { createSessionSchema, listQuerySchema } from '@/lib/council/contract';
import { createSession, listSessions } from '@/lib/council/sessions.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.council.sessions.list', roles: ['ADMIN'], query: listQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listSessions(query))
);

export const POST = defineRoute(
  {
    name: 'admin.council.sessions.create',
    roles: ['ADMIN'],
    schema: createSessionSchema,
    rateLimit: { max: 6, windowMs: 10 * 60_000, by: 'user' },
    idempotent: true,
  },
  async ({ body, session, request }) => ok(await createSession(body, actorFromSession(session), request), { status: 201 })
);
