import { assertModuleEnabled } from '@/lib/module-gate';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { z } from 'zod';
import { HHMM_RE, isYmd, validateShiftTimes } from '@/lib/staff-ops/core';
import { notifyStaffShiftPlanned } from '@/lib/staff-ops/notify';


export const dynamic = 'force-dynamic';

const createSchema = z.object({
  userId: z.string().min(1).max(191),
  date: z.string().refine(isYmd), // YYYY-MM-DD
  startTime: z.string().regex(HHMM_RE),
  endTime: z.string().regex(HHMM_RE),
  note: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  // staff_management modülü kapalıysa uç da kapalı (yalnız menüde değil).
  const moduleGate = await assertModuleEnabled('staff_management', { role: 'dealer' }).catch(() => null);
  if (moduleGate) return moduleGate;
  const dealerId = auth.session.user.id;
  const limited = await enforceRouteRateLimit('dealer.staff.shifts.list', dealerId, 'read');
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const userId = searchParams.get('userId');

  const where: { dealerId: string; date?: { gte?: Date; lte?: Date }; userId?: string } = { dealerId };
  if (userId) where.userId = userId;
  // Varsayılan pencere: son 7 gün + önümüzdeki 14 gün (eskiden en ESKİ kayıtlar dönüyordu).
  const fromDate = from && isYmd(from) ? new Date(from) : new Date(Date.now() - 7 * 86_400_000);
  const toDate = to && isYmd(to) ? new Date(to) : new Date(Date.now() + 14 * 86_400_000);
  where.date = { gte: fromDate, lte: toDate };

  const shifts = await prisma.staffShift.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { date: 'asc' },
    take: 500,
  });

  return NextResponse.json({ success: true, shifts }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  // staff_management modülü kapalıysa uç da kapalı (yalnız menüde değil).
  const moduleGate = await assertModuleEnabled('staff_management', { role: 'dealer' }).catch(() => null);
  if (moduleGate) return moduleGate;
  const dealerId = auth.session.user.id;
  const limited = await enforceRouteRateLimit('dealer.staff.shifts.create', dealerId, 'mutation');
  if (limited) return limited;

  const body: unknown = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }
  const timeError = validateShiftTimes(parsed.data.startTime, parsed.data.endTime);
  if (timeError) {
    return NextResponse.json({ error: timeError }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  // P0-11: yalnız bu işletmenin AKTİF personeline atanır (ayrılmış/pasif personel hedeflenemez).
  const staff = await prisma.dealerStaff.findFirst({
    where: { dealerId, userId: parsed.data.userId, isActive: true },
    select: { id: true },
  });
  if (!staff) {
    return NextResponse.json({ error: 'Bu personel bu işletmeye bağlı değil' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const shift = await prisma.staffShift.create({
    data: {
      dealerId,
      userId: parsed.data.userId,
      date: new Date(parsed.data.date),
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      note: parsed.data.note ?? null,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  await notifyStaffShiftPlanned(shift.userId, `${parsed.data.date} · ${shift.startTime}–${shift.endTime}`);
  return NextResponse.json({ success: true, shift }, { headers: PRIVATE_NO_STORE_HEADERS });
}
