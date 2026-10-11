/** POST /api/admin/ai/studio/tones/preview — taslak üslupla gerçek otomatik yanıt önizlemesi (AI geçidi + kullanım kaydı). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { tonePreviewSchema } from '@/lib/ai-studio/contract';
import { previewTone } from '@/lib/ai-studio/tones.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.ai-studio.tones.preview', roles: ['ADMIN'], schema: tonePreviewSchema, rateLimit: 'ai' },
  async ({ body, user }) => ok(await previewTone(body, user.id))
);
