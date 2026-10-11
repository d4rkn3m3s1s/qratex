/** PATCH /api/admin/ai/studio/tones/:id — ad / talimat (anahtar değişmez), expectedVersion → 409, gerekçeli denetim. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { toneUpdateSchema } from '@/lib/ai-studio/contract';
import { updateTone } from '@/lib/ai-studio/tones.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

export const PATCH = defineRoute(
  { name: 'admin.ai-studio.tones.update', roles: ['ADMIN'], params, schema: toneUpdateSchema, rateLimit: 'mutation' },
  async ({ params: p, body, session, request }) => ok(await updateTone(p.id, body, actorFromSession(session), request))
);
