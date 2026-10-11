/** POST /api/admin/ai/quality/chats/[id]/reveal — gerekçeli maskesiz metin; denetim kaydı zorunlu. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { chatRevealSchema } from '@/lib/ai-quality/contract';
import { revealChat } from '@/lib/ai-quality/chats.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.ai.quality.chats.reveal', roles: ['ADMIN'], params, schema: chatRevealSchema, rateLimit: 'sensitive' },
  async ({ params, body, session, request }) => ok(await revealChat(params.id, body.reason, actorFromSession(session), request))
);
