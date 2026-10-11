/** POST /api/admin/ai/studio/prompts/preview — taslak notlarla modele gidecek ek blok (LLM çağrısı yok). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { notePreviewSchema } from '@/lib/ai-studio/contract';
import { previewNotes } from '@/lib/ai-studio/prompts.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.ai-studio.prompts.preview', roles: ['ADMIN'], schema: notePreviewSchema, rateLimit: 'mutation' },
  async ({ body }) => ok(await previewNotes(body))
);
