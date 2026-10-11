import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { addDaysYmd, dbDateToYmd, isYmd, weekStartYmd, ymdToDbDate } from '@/lib/staff-ops/core';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dealer/staff/shifts/copy-week { fromWeek, toWeek } — bir haftanın vardiya PLANINI
 * (saat + not; puantaj değil) başka haftaya kopyalar. Hedefte aynı kişi + gün + başlangıç saati
 * zaten varsa atlanır (tekrar basmak çift kayıt üretmez). Yalnız AKTİF personelin vardiyaları.
 */
export const POST = defineRoute(
  {
    name: 'dealer.team.shifts.copyWeek',
    roles: ['DEALER'],
    tenant: 'dealer',
    module: 'staff_management',
    schema: z.object({
      fromWeek: z.string().refine(isYmd, 'Geçerli bir hafta seçin.'),
      toWeek: z.string().refine(isYmd, 'Geçerli bir hafta seçin.'),
    }),
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
  },
  async ({ tenant, body }) => {
    const dealerId = tenant.dealerId;
    const from = weekStartYmd(body.fromWeek);
    const to = weekStartYmd(body.toWeek);
    if (from === to) throw new ApiError('VALIDATION', 'Kaynak ve hedef hafta aynı olamaz.');

    const [source, target, active] = await Promise.all([
      prisma.staffShift.findMany({
        where: { dealerId, date: { gte: ymdToDbDate(from), lte: ymdToDbDate(addDaysYmd(from, 6)) } },
        select: { userId: true, date: true, startTime: true, endTime: true, note: true },
        take: 600,
      }),
      prisma.staffShift.findMany({
        where: { dealerId, date: { gte: ymdToDbDate(to), lte: ymdToDbDate(addDaysYmd(to, 6)) } },
        select: { userId: true, date: true, startTime: true },
        take: 600,
      }),
      prisma.dealerStaff.findMany({ where: { dealerId, isActive: true }, select: { userId: true }, take: 200 }),
    ]);
    const activeSet = new Set(active.map((a) => a.userId));
    const existing = new Set(target.map((t) => `${t.userId}|${dbDateToYmd(t.date)}|${t.startTime}`));
    const offsetDays = Math.round((ymdToDbDate(to).getTime() - ymdToDbDate(from).getTime()) / 86_400_000);

    const rows = source
      .filter((s) => activeSet.has(s.userId))
      .map((s) => ({
        dealerId,
        userId: s.userId,
        date: ymdToDbDate(addDaysYmd(dbDateToYmd(s.date), offsetDays)),
        startTime: s.startTime,
        endTime: s.endTime,
        note: s.note,
      }))
      .filter((r) => !existing.has(`${r.userId}|${dbDateToYmd(r.date)}|${r.startTime}`));

    if (rows.length) await prisma.staffShift.createMany({ data: rows });
    return ok({ created: rows.length, skipped: source.length - rows.length });
  }
);
