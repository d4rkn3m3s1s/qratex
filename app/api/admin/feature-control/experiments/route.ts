/** GET/POST /api/admin/feature-control/experiments — A/B deney listesi; yeni deney (taslak olarak doğar). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { CreateExperimentBody } from '@/lib/admin-flags/contract';
import { createExperiment, getExperimentsState } from '@/lib/admin-flags/experiments.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({ name: 'admin.featureControl.experiments', roles: ['ADMIN'], rateLimit: 'read' }, async () =>
  ok(await getExperimentsState())
);

export const POST = defineRoute(
  { name: 'admin.featureControl.experiments.create', roles: ['ADMIN'], schema: CreateExperimentBody, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok({ version: await createExperiment(actionCtx(session, request), body) }, { status: 201 })
);
