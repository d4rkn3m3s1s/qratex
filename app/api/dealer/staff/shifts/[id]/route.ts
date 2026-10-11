import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { HHMM_RE, isYmd, shiftWindow, validateShiftTimes, ymdToDbDate } from '@/lib/staff-ops/core';

export const dynamic = 'force-dynamic';

const params = z.object({ id: z.string().min(1).max(64) });

const body = z
  .object({
    date: z.string().refine(isYmd, 'Geçerli bir tarih seçin.').optional(),
    startTime: z.string().regex(HHMM_RE, 'Saat SS:DD olmalı.').optional(),
    endTime: z.string().regex(HHMM_RE, 'Saat SS:DD olmalı.').optional(),
    note: z.string().trim().max(500).nullable().optional(),
    /** Yönetici puantaj düzeltmesi (ISO) — `null` kaydı temizler. */
    clockInAt: z.string().datetime().nullable().optional(),
    clockOutAt: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Değişiklik yok.' });

/** PATCH /api/dealer/staff/shifts/[id] — vardiya planını düzenle ya da puantajı düzelt (denetim kaydıyla). */
export const PATCH = defineRoute(
  {
    name: 'dealer.team.shifts.update',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    params,
    schema: body,
    rateLimit: 'mutation',
  },
  async ({ tenant, params: p, body: b, user, request }) => {
    const shift = await prisma.staffShift.findFirst({ where: { id: p.id, dealerId: tenant.dealerId } });
    if (!shift) throw new ApiError('NOT_FOUND', 'Vardiya bulunamadı.');
    const startTime = b.startTime ?? shift.startTime;
    const endTime = b.endTime ?? shift.endTime;
    const timeError = validateShiftTimes(startTime, endTime);
    if (timeError) throw new ApiError('VALIDATION', timeError);

    const clockIn = b.clockInAt === undefined ? shift.clockInAt : b.clockInAt ? new Date(b.clockInAt) : null;
    const clockOut = b.clockOutAt === undefined ? shift.clockOutAt : b.clockOutAt ? new Date(b.clockOutAt) : null;
    if (clockOut && !clockIn) throw new ApiError('VALIDATION', 'Giriş saati olmadan çıkış saati girilemez.');
    if (clockIn && clockOut && clockOut <= clockIn) throw new ApiError('VALIDATION', 'Çıkış saati girişten sonra olmalı.');
    const now = new Date();
    if ((clockIn && clockIn > now) || (clockOut && clockOut > now)) {
      throw new ApiError('VALIDATION', 'Puantaj saati gelecekte olamaz.');
    }

    const updated = await prisma.staffShift.update({
      where: { id: shift.id },
      data: {
        ...(b.date ? { date: ymdToDbDate(b.date) } : {}),
        startTime,
        endTime,
        ...(b.note !== undefined ? { note: b.note || null } : {}),
        ...(b.clockInAt !== undefined ? { clockInAt: clockIn } : {}),
        ...(b.clockOutAt !== undefined ? { clockOutAt: clockOut } : {}),
      },
    });
    const corrected = b.clockInAt !== undefined || b.clockOutAt !== undefined;
    await prisma.auditLog
      .create({
        data: {
          userId: user.id,
          action: corrected ? 'CORRECT_STAFF_ATTENDANCE' : 'UPDATE_STAFF_SHIFT',
          entity: 'StaffShift',
          entityId: shift.id,
          oldData: {
            date: shift.date.toISOString().slice(0, 10),
            startTime: shift.startTime,
            endTime: shift.endTime,
            clockInAt: shift.clockInAt?.toISOString() ?? null,
            clockOutAt: shift.clockOutAt?.toISOString() ?? null,
          },
          newData: {
            startTime,
            endTime,
            clockInAt: updated.clockInAt?.toISOString() ?? null,
            clockOutAt: updated.clockOutAt?.toISOString() ?? null,
          },
          ...getAuditRequestMeta(request),
        },
      })
      .catch(() => {});
    return ok({ id: updated.id, plannedMinutes: shiftWindow(updated)?.plannedMinutes ?? null });
  }
);

/** DELETE /api/dealer/staff/shifts/[id] — yalnız henüz giriş yapılmamış planı kaldırır; puantaj kaydı silinmez. */
export const DELETE = defineRoute(
  {
    name: 'dealer.team.shifts.delete',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    params,
    rateLimit: 'mutation',
  },
  async ({ tenant, params: p, user, request }) => {
    const res = await prisma.staffShift.deleteMany({
      where: { id: p.id, dealerId: tenant.dealerId, clockInAt: null },
    });
    if (res.count === 0) {
      const exists = await prisma.staffShift.findFirst({ where: { id: p.id, dealerId: tenant.dealerId }, select: { id: true } });
      if (exists) throw new ApiError('CONFLICT', 'Giriş yapılmış vardiya silinemez; puantaj kaydı korunur. Saatleri düzenleyebilirsiniz.');
      throw new ApiError('NOT_FOUND', 'Vardiya bulunamadı.');
    }
    await prisma.auditLog
      .create({ data: { userId: user.id, action: 'DELETE_STAFF_SHIFT', entity: 'StaffShift', entityId: p.id, ...getAuditRequestMeta(request) } })
      .catch(() => {});
    return ok({ id: p.id });
  }
);
