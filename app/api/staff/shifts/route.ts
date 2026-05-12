import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const clockSchema = z.object({
  shiftId: z.string(),
  action: z.enum(['clock_in', 'clock_out']),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['STAFF']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const where: { userId: string; date?: { gte?: Date; lte?: Date } } = { userId };
  if (from) where.date = { ...(where.date as object), gte: new Date(from) };
  if (to) where.date = { ...(where.date as object), lte: new Date(to) };

  const shifts = await prisma.staffShift.findMany({
    where,
    orderBy: { date: 'desc' },
    take: 30,
  });

  return NextResponse.json({ success: true, shifts });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(['STAFF']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  const body = await request.json();
  const parsed = clockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 });
  }

  const shift = await prisma.staffShift.findFirst({
    where: { id: parsed.data.shiftId, userId },
  });
  if (!shift) {
    return NextResponse.json({ error: 'Vardiya bulunamadı' }, { status: 404 });
  }

  const now = new Date();
  const data =
    parsed.data.action === 'clock_in'
      ? { clockInAt: now }
      : { clockOutAt: now };

  const updated = await prisma.staffShift.update({
    where: { id: parsed.data.shiftId },
    data,
  });

  return NextResponse.json({ success: true, shift: updated });
}
