/** POST /api/admin/ai/studio/learning/restore — geçmişteki onaylı kuralları YENİ ÖNERİ olarak yükle (onaya düşer). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { restoreHistorySchema } from '@/lib/ai-studio/contract';
import { restoreHistoryAsProposal } from '@/lib/ai-studio/learning.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.ai-studio.learning.restore', roles: ['ADMIN'], schema: restoreHistorySchema, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await restoreHistoryAsProposal(body, actorFromSession(session), request))
);
