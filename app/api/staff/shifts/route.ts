import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { CLOCK_ERROR_MESSAGES, decideClock, isYmd, ymdToDbDate } from '@/lib/staff-ops/core';
import { toShiftDto } from '@/lib/staff-ops/server';

export const dynamic = 'force-dynamic';

/** GET /api/staff/shifts?from&to — kendi vardiyalarım (en fazla 62 gün aralık). */
export const GET = defineRoute(
  {
    name: 'staff.shifts.list',
    roles: ['STAFF'],
    tenant: { kind: 'dealer', allowRoles: ['STAFF'] },
    query: z.object({ from: z.string().refine(isYmd), to: z.string().refine(isYmd) }),
    rateLimit: 'read',
  },
  async ({ tenant, user, query }) => {
    if (query.to < query.from) throw new ApiError('VALIDATION', 'Bitiş tarihi başlangıçtan önce olamaz.');
    const rows = await prisma.staffShift.findMany({
      where: { userId: user.id, dealerId: tenant.dealerId, date: { gte: ymdToDbDate(query.from), lte: ymdToDbDate(query.to) } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 120,
    });
    const now = new Date();
    return ok({ shifts: rows.map((r) => toShiftDto(r, now)) });
  }
);

/**
 * PATCH /api/staff/shifts { shiftId, action: 'clock_in' | 'clock_out' } — puantaj. Sunucu otoriter:
 * durum makinesi + zaman penceresi (`decideClock`) ve yarışa dayanıklı koşullu güncelleme
 * (giriş yalnız `clockInAt IS NULL`, çıkış yalnız `clockInAt NOT NULL AND clockOutAt IS NULL`).
 * Her olay denetim kaydına (IP/UA) yazılır.
 */
export const PATCH = defineRoute(
  {
    name: 'staff.shifts.clock',
    roles: ['STAFF'],
    tenant: { kind: 'dealer', allowRoles: ['STAFF'] },
    schema: z.object({ shiftId: z.string().min(1).max(64), action: z.enum(['clock_in', 'clock_out']) }),
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
  },
  async ({ tenant, user, body, request }) => {
    const shift = await prisma.staffShift.findFirst({
      where: { id: body.shiftId, userId: user.id, dealerId: tenant.dealerId },
    });
    if (!shift) throw new ApiError('NOT_FOUND', 'Vardiya bulunamadı.');
    const now = new Date();
    const decision = decideClock(shift, body.action, now);
    if (!decision.ok) throw new ApiError(decision.code, CLOCK_ERROR_MESSAGES[decision.code], { status: 409 });

    const write = await prisma.staffShift.updateMany({
      where:
        body.action === 'clock_in'
          ? { id: shift.id, userId: user.id, clockInAt: null }
          : { id: shift.id, userId: user.id, clockInAt: { not: null }, clockOutAt: null },
      data: body.action === 'clock_in' ? { clockInAt: now } : { clockOutAt: now },
    });
    if (write.count === 0) throw new ApiError('CONFLICT', 'Vardiya durumu bu arada değişti. Ekranı yenileyin.');

    await prisma.auditLog
      .create({
        data: {
          userId: user.id,
          action: body.action === 'clock_in' ? 'STAFF_CLOCK_IN' : 'STAFF_CLOCK_OUT',
          entity: 'StaffShift',
          entityId: shift.id,
          newData: { at: now.toISOString() },
          ...getAuditRequestMeta(request),
        },
      })
      .catch(() => {});

    const fresh = await prisma.staffShift.findUnique({ where: { id: shift.id } });
    return ok({ shift: fresh ? toShiftDto(fresh, now) : null });
  }
);
