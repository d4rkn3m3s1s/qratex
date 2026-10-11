import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { decideStaffTaskTransition } from '@/lib/staff-ops/core';
import { toTaskDto } from '@/lib/staff-ops/server';
import { notifyDealerTaskCompleted } from '@/lib/staff-ops/notify';

export const dynamic = 'force-dynamic';

/** GET /api/staff/tasks?done=1&cursor= — tamamlanan görev geçmişim (sayfalı, en yeni önce). Açık görevler /api/staff/today'de. */
export const GET = defineRoute(
  {
    name: 'staff.tasks.history',
    roles: ['STAFF'],
    tenant: { kind: 'dealer', allowRoles: ['STAFF'] },
    query: z.object({ cursor: z.string().max(64).optional() }),
    rateLimit: 'read',
  },
  async ({ tenant, user, query }) => {
    const rows = await prisma.staffTask.findMany({
      where: { assignedTo: user.id, dealerId: tenant.dealerId, status: 'completed' },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: 21,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const now = new Date();
    const page = rows.slice(0, 20);
    return ok({ tasks: page.map((t) => toTaskDto(t, now)), nextCursor: rows.length > 20 ? page[page.length - 1]?.id ?? null : null });
  }
);

/**
 * PATCH /api/staff/tasks?id= { status: 'in_progress' | 'completed' | 'reopen' } — personel görev geçişi.
 * İptal personele açık DEĞİL; tamamlama yalnız 10 dk içinde geri alınabilir. Geçiş koşullu
 * güncellemeyle yapılır (yarışta 409). Tamamlamada işletme sahibine bildirim gider.
 */
export const PATCH = defineRoute(
  {
    name: 'staff.tasks.transition',
    roles: ['STAFF'],
    tenant: { kind: 'dealer', allowRoles: ['STAFF'] },
    query: z.object({ id: z.string().min(1).max(64) }),
    schema: z.object({ status: z.enum(['in_progress', 'completed', 'reopen']) }),
    rateLimit: 'mutation',
  },
  async ({ tenant, user, query, body, session }) => {
    const task = await prisma.staffTask.findFirst({
      where: { id: query.id, assignedTo: user.id, dealerId: tenant.dealerId },
    });
    if (!task) throw new ApiError('NOT_FOUND', 'Görev bulunamadı.');
    const now = new Date();
    const d = decideStaffTaskTransition(task, body.status, now);
    if (!d.ok) throw new ApiError('CONFLICT', d.message);

    const write = await prisma.staffTask.updateMany({
      where: { id: task.id, assignedTo: user.id, status: { in: d.from } },
      data: { status: d.to, completedAt: d.to === 'completed' ? now : null },
    });
    if (write.count === 0) throw new ApiError('CONFLICT', 'Görev bu arada değişti. Ekranı yenileyin.');

    if (d.to === 'completed') await notifyDealerTaskCompleted(tenant.dealerId, session.user.name ?? null, task.title);
    const fresh = await prisma.staffTask.findUnique({ where: { id: task.id } });
    return ok({ task: fresh ? toTaskDto(fresh, now) : null });
  }
);
