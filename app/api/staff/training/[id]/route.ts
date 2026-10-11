import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

/** GET /api/staff/training/[id] — eğitim modülünün içeriği (düz metin olarak gösterilir; HTML çalıştırılmaz). */
export const GET = defineRoute(
  {
    name: 'staff.training.get',
    roles: ['STAFF'],
    tenant: { kind: 'dealer', allowRoles: ['STAFF'] },
    params: z.object({ id: z.string().min(1).max(64) }),
    rateLimit: 'read',
  },
  async ({ tenant, user, params }) => {
    const m = await prisma.trainingModule.findFirst({
      where: { id: params.id, isActive: true, OR: [{ dealerId: tenant.dealerId }, { dealerId: null }] },
      select: {
        id: true,
        title: true,
        description: true,
        content: true,
        completions: { where: { userId: user.id }, select: { completedAt: true }, take: 1 },
      },
    });
    if (!m) throw new ApiError('NOT_FOUND', 'Eğitim modülü bulunamadı.');
    return ok({
      id: m.id,
      title: m.title,
      description: m.description,
      content: m.content,
      completedAt: m.completions[0]?.completedAt.toISOString() ?? null,
    });
  }
);
