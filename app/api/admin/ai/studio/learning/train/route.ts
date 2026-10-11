/** POST /api/admin/ai/studio/learning/train — anonim öğrenme önerisi üret (atomik kilit, veri eşiği, AI geçidi). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { runSystemTraining } from '@/lib/ai-studio/learning.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = defineRoute(
  { name: 'admin.ai-studio.learning.train', roles: ['ADMIN'], rateLimit: { max: 3, windowMs: 10 * 60_000, by: 'user' } },
  async ({ session, request }) => ok(await runSystemTraining(actorFromSession(session), request))
);
