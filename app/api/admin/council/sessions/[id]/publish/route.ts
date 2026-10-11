/**
 * POST /api/admin/council/sessions/[id]/publish — karar aksiyonlarını bir bayinin aksiyon kuyruğuna yazar.
 * (oturum, bayi, aksiyon) başına tek kez; denetim kaydı + bayiye uygulama içi bildirim.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { publishSchema } from '@/lib/council/contract';
import { publishActions } from '@/lib/council/sessions.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.council.sessions.publish', roles: ['ADMIN'], params, schema: publishSchema, rateLimit: 'mutation', idempotent: true },
  async ({ params, body, session, request }) => ok(await publishActions(params.id, body, actorFromSession(session), request))
);
