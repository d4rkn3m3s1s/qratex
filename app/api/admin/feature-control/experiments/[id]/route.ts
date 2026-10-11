/** PATCH /api/admin/feature-control/experiments/:id — düzenle / başlat / duraklat / sürdür / tamamla / taslağı sil. */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { ExperimentActionBody } from '@/lib/admin-flags/contract';
import { actOnExperiment } from '@/lib/admin-flags/experiments.server';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().min(1).max(64) });

export const PATCH = defineRoute(
  { name: 'admin.featureControl.experiments.act', roles: ['ADMIN'], params: Params, schema: ExperimentActionBody, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok({ version: await actOnExperiment(actionCtx(session, request), params.id, body) })
);
