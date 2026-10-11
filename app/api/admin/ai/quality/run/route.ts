/**
 * POST /api/admin/ai/quality/run — "Şimdi örnekle": haftalık işin aynısını elle tetikler
 * (katmanlı rastgele, LLM dışı analiz ve demo bayi hariç). Denetim kaydı yazılır.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { sampleRunSchema } from '@/lib/ai-quality/contract';
import { runSampling } from '@/lib/ai-quality/quality.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.ai.quality.run', roles: ['ADMIN'], schema: sampleRunSchema, rateLimit: 'sensitive', idempotent: true },
  async ({ body, session, request }) => ok(await runSampling(body, actorFromSession(session), { request }))
);
