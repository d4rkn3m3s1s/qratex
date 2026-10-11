import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { CHECKLIST_MAX_ITEMS, CHECKLIST_TYPES, parseChecklistItems } from '@/lib/staff-ops/core';

export const dynamic = 'force-dynamic';

/** GET /api/dealer/staff/checklists — işletmenin aktif kontrol listeleri. */
export const GET = defineRoute(
  {
    name: 'dealer.team.checklists.list',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    rateLimit: 'read',
  },
  async ({ tenant }) => {
    const rows = await prisma.checklistTemplate.findMany({
      where: { dealerId: tenant.dealerId, isActive: true },
      select: { id: true, type: true, title: true, items: true },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      take: 100,
    });
    return ok({ templates: rows.map((r) => ({ ...r, items: parseChecklistItems(r.items) })) }, { legacySpread: true });
  }
);

/** POST /api/dealer/staff/checklists — yeni kontrol listesi (açılış / kapanış / özel; en fazla 50 madde). */
export const POST = defineRoute(
  {
    name: 'dealer.team.checklists.create',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    schema: z.object({
      type: z.enum(CHECKLIST_TYPES),
      title: z.string().trim().min(1, 'Başlık gerekli.').max(200),
      items: z
        .array(
          z.object({
            id: z.string().min(1).max(64),
            label: z.string().trim().min(1, 'Madde boş olamaz.').max(200),
            required: z.boolean().default(true),
          })
        )
        .min(1, 'En az bir madde ekleyin.')
        .max(CHECKLIST_MAX_ITEMS, `En fazla ${CHECKLIST_MAX_ITEMS} madde eklenebilir.`),
    }),
    rateLimit: 'mutation',
  },
  async ({ tenant, body }) => {
    const template = await prisma.checklistTemplate.create({
      data: { dealerId: tenant.dealerId, type: body.type, title: body.title, items: body.items as object },
      select: { id: true, title: true },
    });
    return ok({ template }, { status: 201, legacySpread: true });
  }
);
