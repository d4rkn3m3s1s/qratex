/**
 * POST /api/admin/pricing/plans/:id/archive — planı arşivle (silme YOK). `{ dryRun: true }` → etki
 * önizlemesi; abonesi olan plan `{ confirm: true }` olmadan 409 CONFIRM_REQUIRED. Aboneler planda kalır.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { ArchivePlanBody } from '@/lib/admin-pricing/contract';
import { archivePlan } from '@/lib/admin-pricing/pricing.server';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().min(1).max(64) });

export const POST = defineRoute(
  { name: 'admin.pricing.plans.archive', roles: ['ADMIN'], params: Params, schema: ArchivePlanBody, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => ok(await archivePlan(actionCtx(session, request), params.id, body ?? {}))
);
