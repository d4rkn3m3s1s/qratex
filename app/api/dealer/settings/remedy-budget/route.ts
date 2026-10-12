/**
 * GET/PATCH /api/dealer/settings/remedy-budget — bayinin günlük telafi puanı bütçesi.
 * Bayi yalnız admin tavanının (varsayılan 5.000) ALTINDA bir limit koyabilir; null = tavan.
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { auditEntry } from '@/lib/data-safety/audit';
import {
  REMEDY_BUDGET_ADMIN_MAX,
  getRemedyBudgetView,
  loadRemedyBudgetConfig,
  saveRemedyBudgetConfig,
  validateDealerCap,
} from '@/lib/remedy-budget';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  dealerCap: z.number().int().min(0).max(REMEDY_BUDGET_ADMIN_MAX).nullable(),
});

export const GET = defineRoute(
  { name: 'dealer.settings.remedy-budget.get', roles: ['DEALER'], rateLimit: 'read' },
  async ({ user }) => ok({ budget: await getRemedyBudgetView(prisma, user.id) })
);

export const PATCH = defineRoute(
  { name: 'dealer.settings.remedy-budget.patch', roles: ['DEALER'], schema: bodySchema, rateLimit: 'mutation' },
  async ({ user, session, body, request }) => {
    await prisma.$transaction(async (tx) => {
      const before = await loadRemedyBudgetConfig(tx, user.id);
      const err = validateDealerCap(before, body.dealerCap);
      if (err) throw new ApiError('VALIDATION', err);
      const next = { adminCap: before.adminCap, dealerCap: body.dealerCap };
      await saveRemedyBudgetConfig(tx, user.id, next);
      await tx.auditLog.create({
        data: auditEntry(
          { id: user.id, email: session.user.email ?? null, role: user.role, name: session.user.name ?? null },
          { action: 'REMEDY_BUDGET_DEALER_SET', entity: 'User', entityId: user.id, oldData: before, newData: next },
          request
        ),
      });
    });
    return ok({ budget: await getRemedyBudgetView(prisma, user.id) });
  }
);
