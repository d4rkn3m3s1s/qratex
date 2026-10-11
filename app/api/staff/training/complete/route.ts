import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

/**
 * POST /api/staff/training/complete { moduleId, acknowledged: true } — "Okudum ve anladım" onayı.
 * İstemci yalnız içerik okuma görünümü açıldıktan sonra onay kutusunu gösterir; sunucu açık
 * onay (`acknowledged: true`) olmadan kaydı yazmaz. Tekrar onay ilk tarihi korur.
 */
export const POST = defineRoute(
  {
    name: 'staff.training.complete',
    roles: ['STAFF'],
    tenant: { kind: 'dealer', allowRoles: ['STAFF'] },
    schema: z.object({
      moduleId: z.string().min(1).max(64),
      acknowledged: z.literal(true, { errorMap: () => ({ message: 'Eğitimi okuduğunuzu onaylayın.' }) }),
    }),
    rateLimit: 'mutation',
  },
  async ({ tenant, user, body }) => {
    const m = await prisma.trainingModule.findFirst({
      where: { id: body.moduleId, isActive: true, OR: [{ dealerId: tenant.dealerId }, { dealerId: null }] },
      select: { id: true },
    });
    if (!m) throw new ApiError('NOT_FOUND', 'Eğitim modülü bulunamadı.');
    const row = await prisma.staffTrainingCompletion.upsert({
      where: { userId_moduleId: { userId: user.id, moduleId: m.id } },
      create: { userId: user.id, moduleId: m.id },
      update: {},
      select: { completedAt: true },
    });
    return ok({ completedAt: row.completedAt.toISOString() });
  }
);
