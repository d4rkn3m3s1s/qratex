/**
 * GET   /api/admin/council/sessions/[id] — oturum ayrıntısı (transkript, karar, veri paketi, yayın takibi).
 * PATCH /api/admin/council/sessions/[id] — { action: cancel | archive | unarchive } (silme yok; denetimli).
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { sessionActionSchema } from '@/lib/council/contract';
import { getSessionDetail, sessionAction } from '@/lib/council/sessions.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.council.sessions.detail', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params }) => ok(await getSessionDetail(params.id))
);

export const PATCH = defineRoute(
  { name: 'admin.council.sessions.action', roles: ['ADMIN'], params, schema: sessionActionSchema, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await sessionAction(params.id, body.action, actorFromSession(session), request))
);
