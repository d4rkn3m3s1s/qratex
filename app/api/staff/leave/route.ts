import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { dbDateToYmd, istanbulYmd, rangesOverlap, validateLeaveRange, ymdToDbDate } from '@/lib/staff-ops/core';
import { notifyDealerLeaveRequested } from '@/lib/staff-ops/notify';

export const dynamic = 'force-dynamic';

const tenant = { kind: 'dealer', allowRoles: ['STAFF'] } as const;

/** GET /api/staff/leave — kendi izin taleplerim (en yeni önce). */
export const GET = defineRoute(
  { name: 'staff.leave.list', roles: ['STAFF'], tenant, rateLimit: 'read' },
  async ({ tenant: t, user }) => {
    const requests = await prisma.staffLeaveRequest.findMany({
      where: { userId: user.id, dealerId: t.dealerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return ok({ requests }, { legacySpread: true });
  }
);

/**
 * POST /api/staff/leave { startDate, endDate, reason? } — izin talebi. Kurallar (sunucu): bugünden
 * önce başlayamaz, tek talepte ≤ 30 gün, ≤ 1 yıl ileri; bekleyen/onaylı başka talebinizle çakışamaz.
 * İşletme sahibine bildirim gider.
 */
export const POST = defineRoute(
  {
    name: 'staff.leave.create',
    roles: ['STAFF'],
    tenant,
    schema: z.object({
      startDate: z.string().max(10),
      endDate: z.string().max(10),
      reason: z.string().trim().max(500).optional(),
    }),
    rateLimit: { max: 10, windowMs: 60 * 60_000, by: 'user' },
  },
  async ({ tenant: t, user, body, session }) => {
    const today = istanbulYmd(new Date());
    const err = validateLeaveRange(body.startDate, body.endDate, today);
    if (err) throw new ApiError('VALIDATION', err);

    const existing = await prisma.staffLeaveRequest.findMany({
      where: { userId: user.id, dealerId: t.dealerId, status: { in: ['pending', 'approved'] }, endDate: { gte: ymdToDbDate(today) } },
      select: { startDate: true, endDate: true },
      take: 50,
    });
    if (existing.some((e) => rangesOverlap(body.startDate, body.endDate, dbDateToYmd(e.startDate), dbDateToYmd(e.endDate)))) {
      throw new ApiError('CONFLICT', 'Bu tarihlerle çakışan bekleyen ya da onaylı bir talebiniz var.');
    }

    const leave = await prisma.staffLeaveRequest.create({
      data: {
        dealerId: t.dealerId,
        userId: user.id,
        startDate: ymdToDbDate(body.startDate),
        endDate: ymdToDbDate(body.endDate),
        reason: body.reason || null,
      },
    });
    await notifyDealerLeaveRequested(t.dealerId, session.user.name ?? null, `${body.startDate} – ${body.endDate}`);
    return ok({ request: leave }, { status: 201, legacySpread: true });
  }
);

/** DELETE /api/staff/leave?id= — yalnız BEKLEYEN kendi talebini geri çeker (kayıt silinmez, `cancelled`). */
export const DELETE = defineRoute(
  {
    name: 'staff.leave.cancel',
    roles: ['STAFF'],
    tenant,
    query: z.object({ id: z.string().min(1).max(64) }),
    rateLimit: 'mutation',
  },
  async ({ tenant: t, user, query }) => {
    const n = await prisma.staffLeaveRequest.updateMany({
      where: { id: query.id, userId: user.id, dealerId: t.dealerId, status: 'pending' },
      data: { status: 'cancelled' },
    });
    if (n.count === 0) throw new ApiError('CONFLICT', 'Yalnız bekleyen talep geri çekilebilir.');
    return ok({ id: query.id });
  }
);
