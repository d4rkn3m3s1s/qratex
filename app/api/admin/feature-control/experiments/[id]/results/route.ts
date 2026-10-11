/** GET /api/admin/feature-control/experiments/:id/results — sunucuda istatistik (Wilson GA, z-testi, SRM, günlük seri). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getExperimentResults } from '@/lib/admin-flags/experiments.server';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.featureControl.experiments.results', roles: ['ADMIN'], params: Params, rateLimit: 'read' },
  async ({ params }) => ok(await getExperimentResults(params.id))
);
