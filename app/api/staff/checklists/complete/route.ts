import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { CHECKLIST_MAX_ITEMS, istanbulYmd, missingRequiredItems, parseChecklistItems } from '@/lib/staff-ops/core';

export const dynamic = 'force-dynamic';

/**
 * POST /api/staff/checklists/complete { templateId, shiftId?, items } — kontrol listesini gönder.
 * Sunucu otoriter: zorunlu maddelerin hepsi işaretli değilse 400 (eksikler `details`'te); yalnız
 * şablonda tanımlı maddeler kaydedilir; vardiya verilirse kendi vardiyası olmalı; aynı liste
 * aynı İstanbul gününde ikinci kez gönderilemez (409).
 */
export const POST = defineRoute(
  {
    name: 'staff.checklists.complete',
    roles: ['STAFF'],
    tenant: { kind: 'dealer', allowRoles: ['STAFF'] },
    schema: z.object({
      templateId: z.string().min(1).max(64),
      shiftId: z.string().max(64).optional(),
      items: z.array(z.object({ itemId: z.string().min(1).max(64), done: z.boolean() })).max(CHECKLIST_MAX_ITEMS * 2),
    }),
    rateLimit: 'mutation',
  },
  async ({ tenant, user, body }) => {
    const template = await prisma.checklistTemplate.findFirst({
      where: { id: body.templateId, dealerId: tenant.dealerId, isActive: true },
      select: { id: true, items: true },
    });
    if (!template) throw new ApiError('NOT_FOUND', 'Kontrol listesi bulunamadı.');
    const defs = parseChecklistItems(template.items);
    const missing = missingRequiredItems(defs, body.items);
    if (missing.length) {
      throw new ApiError('VALIDATION', `Zorunlu maddeler işaretlenmedi: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`, {
        details: { missing },
      });
    }
    if (body.shiftId) {
      const shift = await prisma.staffShift.findFirst({ where: { id: body.shiftId, userId: user.id, dealerId: tenant.dealerId }, select: { id: true } });
      if (!shift) throw new ApiError('NOT_FOUND', 'Vardiya bulunamadı.');
    }
    const now = new Date();
    const last = await prisma.staffChecklistCompletion.findFirst({
      where: { userId: user.id, templateId: template.id, completedAt: { gte: new Date(now.getTime() - 26 * 3_600_000) } },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    });
    if (last && istanbulYmd(last.completedAt) === istanbulYmd(now)) {
      throw new ApiError('CONFLICT', 'Bu kontrol listesini bugün zaten gönderdiniz.');
    }
    const valid = new Set(defs.map((d) => d.id));
    const completion = await prisma.staffChecklistCompletion.create({
      data: {
        userId: user.id,
        templateId: template.id,
        shiftId: body.shiftId ?? null,
        items: body.items.filter((i) => valid.has(i.itemId)) as object,
      },
      select: { id: true, completedAt: true },
    });
    return ok({ id: completion.id, completedAt: completion.completedAt.toISOString() }, { status: 201 });
  }
);
