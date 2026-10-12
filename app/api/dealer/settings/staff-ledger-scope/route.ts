/**
 * GET/PATCH /api/dealer/settings/staff-ledger-scope — personelin işlem defteri kapsamı.
 * Değerler: today | today_own (varsayılan) | all. Zorlama /api/dealer/consumptions GET'tedir.
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { auditEntry } from '@/lib/data-safety/audit';
import { STAFF_LEDGER_SCOPES } from '@/lib/dealer/kasa/core';
import { getStaffLedgerScope, setStaffLedgerScope } from '@/lib/dealer/kasa/staff-scope.server';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ scope: z.enum(STAFF_LEDGER_SCOPES) });

export const GET = defineRoute(
  { name: 'dealer.settings.staff-ledger-scope.get', roles: ['DEALER'], rateLimit: 'read' },
  async ({ user }) => ok({ scope: await getStaffLedgerScope(user.id) })
);

export const PATCH = defineRoute(
  { name: 'dealer.settings.staff-ledger-scope.patch', roles: ['DEALER'], schema: bodySchema, rateLimit: 'mutation' },
  async ({ user, session, body, request }) => {
    const before = await getStaffLedgerScope(user.id);
    await setStaffLedgerScope(user.id, body.scope);
    await prisma.auditLog
      .create({
        data: auditEntry(
          { id: user.id, email: session.user.email ?? null, role: user.role, name: session.user.name ?? null },
          { action: 'STAFF_LEDGER_SCOPE_SET', entity: 'User', entityId: user.id, oldData: { scope: before }, newData: { scope: body.scope } },
          request
        ),
      })
      .catch(() => null);
    return ok({ scope: body.scope });
  }
);
