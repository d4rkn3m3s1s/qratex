/**
 * POST /api/admin/badges/lab/sandbox — fill | reset | clearCategories | cleanupTest.
 * Üretimde kapalı + yalnız test hesabı (lib/character-test-guard.ts); her işlem denetlenir.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { labSandboxSchema } from '@/lib/admin-badges/contract';
import { runLabSandbox } from '@/lib/admin-badges/lab.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.badges.lab.sandbox', roles: ['ADMIN'], schema: labSandboxSchema, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await runLabSandbox(body, actorFromSession(session), request))
);
