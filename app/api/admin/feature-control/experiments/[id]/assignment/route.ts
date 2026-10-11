/** GET /api/admin/feature-control/experiments/:id/assignment?subject= — kullanıcının düştüğü varyant (hash, yapışkan). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { AssignmentQuery } from '@/lib/admin-flags/contract';
import { checkAssignment } from '@/lib/admin-flags/experiments.server';

export const dynamic = 'force-dynamic';

const Params = z.object({ id: z.string().min(1).max(64) });

export const GET = defineRoute(
  { name: 'admin.featureControl.experiments.assignment', roles: ['ADMIN'], params: Params, query: AssignmentQuery, rateLimit: 'read' },
  async ({ params, query }) => ok(await checkAssignment(params.id, query.subject))
);
