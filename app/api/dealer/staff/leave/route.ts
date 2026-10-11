import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { dbDateToYmd } from '@/lib/staff-ops/core';
import { notifyStaffLeaveDecision } from '@/lib/staff-ops/notify';

export const dynamic = 'force-dynamic';

/** GET /api/dealer/staff/leave?status= — işletmenin izin talepleri (en yeni önce, en fazla 200). */
export const GET = defineRoute(
  {
    name: 'dealer.team.leave.list',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    query: z.object({ status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional() }),
    rateLimit: 'read',
  },
  async ({ tenant, query }) => {
    const requests = await prisma.staffLeaveRequest.findMany({
      where: { dealerId: tenant.dealerId, ...(query.status ? { status: query.status } : {}) },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return ok({ requests }, { legacySpread: true });
  }
);

/**
 * PATCH /api/dealer/staff/leave?id= { status: 'approved' | 'rejected' } — yalnız BEKLEYEN talep
 * karara bağlanır (koşullu güncelleme; iki yönetici aynı anda basarsa ikincisi 409). Personele bildirim gider.
 */
export const PATCH = defineRoute(
  {
    name: 'dealer.team.leave.decide',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    query: z.object({ id: z.string().min(1).max(64) }),
    schema: z.object({ status: z.enum(['approved', 'rejected']) }),
    rateLimit: 'mutation',
  },
  async ({ tenant, query, body, user, request }) => {
    const n = await prisma.staffLeaveRequest.updateMany({
      where: { id: query.id, dealerId: tenant.dealerId, status: 'pending' },
      data: { status: body.status },
    });
    if (n.count === 0) throw new ApiError('CONFLICT', 'Talep bulunamadı ya da zaten karara bağlanmış.');
    const updated = await prisma.staffLeaveRequest.findUnique({
      where: { id: query.id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (updated) {
      await notifyStaffLeaveDecision(
        updated.userId,
        body.status === 'approved',
        `${dbDateToYmd(updated.startDate)} – ${dbDateToYmd(updated.endDate)}`
      );
    }
    await prisma.auditLog
      .create({
        data: {
          userId: user.id,
          action: body.status === 'approved' ? 'APPROVE_STAFF_LEAVE' : 'REJECT_STAFF_LEAVE',
          entity: 'StaffLeaveRequest',
          entityId: query.id,
          ...getAuditRequestMeta(request),
        },
      })
      .catch(() => {});
    return ok({ request: updated }, { legacySpread: true });
  }
);
