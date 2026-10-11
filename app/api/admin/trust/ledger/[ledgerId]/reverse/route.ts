/** POST /api/admin/trust/ledger/:ledgerId/reverse — puan kazanımını lib/economy üzerinden geri alır (tek-kez). */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { actionCtx } from '@/lib/admin-users/actions.server';
import { ReverseLedgerBody } from '@/lib/admin-trust/contract';
import { reverseLedgerEntry } from '@/lib/admin-trust/trust.server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'admin.trust.ledger.reverse',
    roles: ['ADMIN'],
    params: z.object({ ledgerId: z.string().min(1).max(64) }),
    schema: ReverseLedgerBody,
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
  },
  async ({ params, body, session, request }) => ok(await reverseLedgerEntry(actionCtx(session, request), params.ledgerId, body))
);
