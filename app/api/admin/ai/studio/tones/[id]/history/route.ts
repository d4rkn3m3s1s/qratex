/** GET /api/admin/ai/studio/tones/:id/history — üslup değişiklik geçmişi (önce/sonra tam metin). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getToneHistory } from '@/lib/ai-studio/tones.server';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

export const GET = defineRoute(
  { name: 'admin.ai-studio.tones.history', roles: ['ADMIN'], params, rateLimit: 'read' },
  async ({ params: p }) => ok(await getToneHistory(p.id))
);
