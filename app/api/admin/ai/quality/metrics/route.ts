/** GET /api/admin/ai/quality/metrics — haftalık doğruluk, model/alan kırılımı, inceleme oranı, son örnekleme. */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getQualityMetrics } from '@/lib/ai-quality/quality.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.ai.quality.metrics', roles: ['ADMIN'], rateLimit: 'read' },
  async () => ok(await getQualityMetrics())
);
