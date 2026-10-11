/** GET /api/admin/ai/quality/chats/[id] — maskeli tam metin + konuşma bağlamı; her okuma denetim kaydına yazılır. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { getChatDetail } from '@/lib/ai-quality/chats.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().trim().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.ai.quality.chats.detail', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params, session, request }) => ok(await getChatDetail(params.id, actorFromSession(session), request))
);
