/** POST /api/admin/ai/studio/prompts/versions/:id — taslağı yayınla ya da sil (sürüm kontrollü, denetimli). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { noteActionSchema } from '@/lib/ai-studio/contract';
import { noteVersionAction } from '@/lib/ai-studio/prompts.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

export const POST = defineRoute(
  { name: 'admin.ai-studio.prompts.version', roles: ['ADMIN'], params, schema: noteActionSchema, rateLimit: 'mutation' },
  async ({ params: p, body, session, request }) => ok(await noteVersionAction(p.id, body.action, body.baseVersion, actorFromSession(session), request))
);
