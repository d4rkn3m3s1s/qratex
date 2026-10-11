/** GET /api/admin/ai/quality/samples — AI kalite inceleme kuyruğu (sayfalı, filtreli, PII maskeli önizleme). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { sampleListQuerySchema } from '@/lib/ai-quality/contract';
import { listSamples } from '@/lib/ai-quality/quality.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.ai.quality.samples.list', roles: ['ADMIN'], query: sampleListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listSamples(query))
);
