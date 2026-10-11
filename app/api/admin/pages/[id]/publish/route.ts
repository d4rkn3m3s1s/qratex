/** POST /api/admin/pages/[id]/publish — yayına al / yayından kaldır (iyimser kilit; boş içerik yayınlanmaz). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { cmsPublishSchema } from '@/lib/cms-pages/contract';
import { setCmsPublished } from '@/lib/cms-pages/pages.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.pages.publish', roles: ['ADMIN'], params: z.object({ id: z.string().min(1).max(64) }), schema: cmsPublishSchema, rateLimit: 'mutation' },
  async ({ params: p, body, session, request }) => ok(await setCmsPublished({ actor: actorFromSession(session), request }, p.id, body))
);
