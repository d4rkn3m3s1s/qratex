/** POST /api/admin/ai/studio/prompts/drafts — not taslağı (gerekçeli, sürüm kontrollü; yürürlüğe girmez). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { noteDraftSchema } from '@/lib/ai-studio/contract';
import { createNoteDraft } from '@/lib/ai-studio/prompts.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.ai-studio.prompts.draft', roles: ['ADMIN'], schema: noteDraftSchema, rateLimit: 'mutation', idempotent: true },
  async ({ body, session, request }) => ok(await createNoteDraft(body, actorFromSession(session), request), { status: 201 })
);
