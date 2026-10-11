import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

/** GET /api/dealer/staff/training/[id] — modül içeriği (düzenleyici ve önizleme için). Genel modüller salt okunur. */
export const GET = defineRoute(
  {
    name: 'dealer.team.training.get',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    params,
    rateLimit: 'read',
  },
  async ({ tenant, params: p }) => {
    const m = await prisma.trainingModule.findFirst({
      where: { id: p.id, OR: [{ dealerId: tenant.dealerId }, { dealerId: null }] },
      select: { id: true, title: true, description: true, content: true, dealerId: true, isActive: true },
    });
    if (!m) throw new ApiError('NOT_FOUND', 'Eğitim modülü bulunamadı.');
    return ok({ id: m.id, title: m.title, description: m.description, content: m.content, isGlobal: m.dealerId == null, isActive: m.isActive });
  }
);

/** PATCH /api/dealer/staff/training/[id] — işletmeye ait modülü düzenle ya da arşivle (`isActive:false`; silme yok). */
export const PATCH = defineRoute(
  {
    name: 'dealer.team.training.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    params,
    schema: z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(500).nullable().optional(),
        content: z.string().trim().min(1, 'İçerik boş olamaz.').max(20_000, 'İçerik en fazla 20.000 karakter olabilir.').optional(),
        isActive: z.boolean().optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: 'Değişiklik yok.' }),
    rateLimit: 'mutation',
  },
  async ({ tenant, params: p, body }) => {
    const res = await prisma.trainingModule.updateMany({
      where: { id: p.id, dealerId: tenant.dealerId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description || null } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
    if (res.count === 0) throw new ApiError('NOT_FOUND', 'Bu modülü düzenleyemezsiniz (genel modüller yalnız okunur).');
    return ok({ id: p.id });
  }
);
