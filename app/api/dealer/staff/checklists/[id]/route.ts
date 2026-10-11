import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { CHECKLIST_MAX_ITEMS, CHECKLIST_TYPES } from '@/lib/staff-ops/core';

export const dynamic = 'force-dynamic';

const item = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1, 'Madde boş olamaz.').max(200),
  required: z.boolean().default(true),
});

/** PATCH /api/dealer/staff/checklists/[id] — kontrol listesini düzenle ya da arşivle (geçmiş tamamlanmalar korunur). */
export const PATCH = defineRoute(
  {
    name: 'dealer.team.checklists.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    params: z.object({ id: z.string().min(1).max(64) }),
    schema: z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        type: z.enum(CHECKLIST_TYPES).optional(),
        items: z.array(item).min(1, 'En az bir madde ekleyin.').max(CHECKLIST_MAX_ITEMS).optional(),
        isActive: z.boolean().optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: 'Değişiklik yok.' }),
    rateLimit: 'mutation',
  },
  async ({ tenant, params, body }) => {
    const res = await prisma.checklistTemplate.updateMany({
      where: { id: params.id, dealerId: tenant.dealerId },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.items !== undefined ? { items: body.items as object } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
    if (res.count === 0) throw new ApiError('NOT_FOUND', 'Kontrol listesi bulunamadı.');
    return ok({ id: params.id });
  }
);
