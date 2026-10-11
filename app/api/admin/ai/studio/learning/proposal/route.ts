/** POST /api/admin/ai/studio/learning/proposal — bekleyen öneriyi onayla / gerekçeyle reddet. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { proposalDecisionSchema } from '@/lib/ai-studio/contract';
import { decideProposal } from '@/lib/ai-studio/learning.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.ai-studio.learning.decide', roles: ['ADMIN'], schema: proposalDecisionSchema, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await decideProposal(body, actorFromSession(session), request))
);
