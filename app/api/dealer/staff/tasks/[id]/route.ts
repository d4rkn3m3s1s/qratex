import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { decideManagerTaskTransition } from '@/lib/staff-ops/core';
import { notifyStaffTaskAssigned } from '@/lib/staff-ops/notify';

export const dynamic = 'force-dynamic';

const body = z
  .object({
    title: z.string().trim().min(1, 'Görev başlığı boş olamaz.').max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    dueAt: z.string().datetime().nullable().optional(),
    assignedTo: z.string().min(1).max(191).optional(),
    /** `cancelled` → iptal (silme yok), `pending` → yeniden aç. */
    status: z.enum(['cancelled', 'pending']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Değişiklik yok.' });

/** PATCH /api/dealer/staff/tasks/[id] — görevi düzenle / yeniden ata / iptal et / yeniden aç. */
export const PATCH = defineRoute(
  {
    name: 'dealer.team.tasks.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    params: z.object({ id: z.string().min(1).max(64) }),
    schema: body,
    rateLimit: 'mutation',
  },
  async ({ tenant, params, body: b, user, request }) => {
    const dealerId = tenant.dealerId;
    const task = await prisma.staffTask.findFirst({ where: { id: params.id, dealerId } });
    if (!task) throw new ApiError('NOT_FOUND', 'Görev bulunamadı.');

    const data: { status?: string; completedAt?: null; title?: string; description?: string | null; dueAt?: Date | null; assignedTo?: string } = {};
    let fromStatuses: string[] | undefined;
    if (b.status) {
      const d = decideManagerTaskTransition(task, b.status);
      if (!d.ok) throw new ApiError('CONFLICT', d.message);
      fromStatuses = d.from;
      data.status = b.status;
      if (b.status === 'pending') data.completedAt = null;
    }
    if (b.title !== undefined) data.title = b.title;
    if (b.description !== undefined) data.description = b.description || null;
    if (b.dueAt !== undefined) data.dueAt = b.dueAt ? new Date(b.dueAt) : null;
    if (b.assignedTo !== undefined && b.assignedTo !== task.assignedTo) {
      const staff = await prisma.dealerStaff.findFirst({
        where: { dealerId, userId: b.assignedTo, isActive: true },
        select: { id: true },
      });
      if (!staff) throw new ApiError('VALIDATION', 'Görev yalnız aktif ekip üyesine atanabilir.');
      data.assignedTo = b.assignedTo;
    }

    const write = await prisma.staffTask.updateMany({
      where: { id: task.id, dealerId, ...(fromStatuses ? { status: { in: fromStatuses } } : {}) },
      data,
    });
    if (write.count === 0) throw new ApiError('CONFLICT', 'Görev bu arada değişti. Sayfayı yenileyip tekrar deneyin.');

    if (data.assignedTo) await notifyStaffTaskAssigned(data.assignedTo, data.title ?? task.title);
    await prisma.auditLog
      .create({
        data: {
          userId: user.id,
          action: 'UPDATE_STAFF_TASK',
          entity: 'StaffTask',
          entityId: task.id,
          oldData: { status: task.status, assignedTo: task.assignedTo },
          newData: { fields: Object.keys(data) },
          ...getAuditRequestMeta(request),
        },
      })
      .catch(() => {});
    return ok({ id: task.id });
  }
);
