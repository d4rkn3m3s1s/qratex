import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

/** GET /api/dealer/staff/training — işletmenin ve genel (platform) aktif eğitim modülleri. */
export const GET = defineRoute(
  {
    name: 'dealer.team.training.list',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    rateLimit: 'read',
  },
  async ({ tenant }) => {
    const modules = await prisma.trainingModule.findMany({
      where: { OR: [{ dealerId: tenant.dealerId }, { dealerId: null }], isActive: true },
      select: { id: true, title: true, description: true, dealerId: true, orderIndex: true, createdAt: true },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return ok({ modules }, { legacySpread: true });
  }
);

/** POST /api/dealer/staff/training — yeni eğitim modülü (düz metin/markdown, en fazla 20.000 karakter). */
export const POST = defineRoute(
  {
    name: 'dealer.team.training.create',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    schema: z.object({
      title: z.string().trim().min(1, 'Başlık gerekli.').max(200),
      description: z.string().trim().max(500).optional(),
      content: z.string().trim().min(1, 'İçerik boş olamaz.').max(20_000, 'İçerik en fazla 20.000 karakter olabilir.'),
    }),
    rateLimit: 'mutation',
  },
  async ({ tenant, body }) => {
    const dealerId = tenant.dealerId;
    const max = await prisma.trainingModule.aggregate({ where: { dealerId }, _max: { orderIndex: true } });
    const trainingModule = await prisma.trainingModule.create({
      data: {
        dealerId,
        title: body.title,
        description: body.description || null,
        content: body.content,
        orderIndex: (max._max.orderIndex ?? -1) + 1,
      },
      select: { id: true, title: true },
    });
    return ok({ module: trainingModule }, { status: 201, legacySpread: true });
  }
);
