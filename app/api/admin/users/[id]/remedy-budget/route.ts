/**
 * GET/PATCH /api/admin/users/[id]/remedy-budget — bayinin günlük telafi puanı bütçesi.
 * Admin tavanı (`adminCap`, null = varsayılan 5.000) yazar; bayinin kendi limiti tavanı
 * aşıyorsa tavana indirilir. Her değişiklik denetim kaydına yazılır.
 */
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { idParamsSchema } from '@/lib/admin-users/contract';
import { auditEntry } from '@/lib/data-safety/audit';
import {
  REMEDY_BUDGET_ADMIN_MAX,
  getRemedyBudgetView,
  loadRemedyBudgetConfig,
  saveRemedyBudgetConfig,
} from '@/lib/remedy-budget';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  adminCap: z.number().int().min(0).max(REMEDY_BUDGET_ADMIN_MAX).nullable(),
});

async function assertDealer(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!u) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı.');
  if (u.role !== 'DEALER') throw new ApiError('BAD_REQUEST', 'Telafi bütçesi yalnız bayiler için ayarlanır.');
}

export const GET = defineRoute(
  { name: 'admin.users.remedy-budget.get', roles: ['ADMIN'], params: idParamsSchema, rateLimit: 'read' },
  async ({ params }) => {
    await assertDealer(params.id);
    return ok({ budget: await getRemedyBudgetView(prisma, params.id) });
  }
);

export const PATCH = defineRoute(
  { name: 'admin.users.remedy-budget.patch', roles: ['ADMIN'], params: idParamsSchema, schema: bodySchema, rateLimit: 'mutation' },
  async ({ params, body, session, request }) => {
    await assertDealer(params.id);
    await prisma.$transaction(async (tx) => {
      const before = await loadRemedyBudgetConfig(tx, params.id);
      const ceiling = body.adminCap ?? null;
      const next = {
        adminCap: ceiling,
        // Bayi limiti yeni tavanın üstünde kalamaz.
        dealerCap:
          before.dealerCap != null && ceiling != null && before.dealerCap > ceiling ? ceiling : before.dealerCap,
      };
      await saveRemedyBudgetConfig(tx, params.id, next);
      await tx.auditLog.create({
        data: auditEntry(
          {
            id: session.user.id,
            email: session.user.email ?? null,
            role: session.user.role ?? null,
            name: session.user.name ?? null,
          },
          { action: 'REMEDY_BUDGET_ADMIN_SET', entity: 'User', entityId: params.id, oldData: before, newData: next },
          request
        ),
      });
    });
    return ok({ budget: await getRemedyBudgetView(prisma, params.id) });
  }
);
