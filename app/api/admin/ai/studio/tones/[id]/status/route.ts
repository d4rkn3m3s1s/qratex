/** POST /api/admin/ai/studio/tones/:id/status — arşivle / yeniden etkinleştir (silme yok). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { toneStatusSchema } from '@/lib/ai-studio/contract';
import { setToneActive } from '@/lib/ai-studio/tones.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

export const POST = defineRoute(
  { name: 'admin.ai-studio.tones.status', roles: ['ADMIN'], params, schema: toneStatusSchema, rateLimit: 'mutation' },
  async ({ params: p, body, session, request }) => ok(await setToneActive(p.id, body, actorFromSession(session), request))
);
