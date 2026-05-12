import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const createSchema = z.object({
  userId: z.string(),
  date: z.string(), // YYYY-MM-DD
  startTime: z.string(),
  endTime: z.string(),
  note: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const userId = searchParams.get('userId');

  const where: { dealerId: string; date?: { gte?: Date; lte?: Date }; userId?: string } = { dealerId };
  if (userId) where.userId = userId;
  if (from) where.date = { ...(where.date as object), gte: new Date(from) };
  if (to) where.date = { ...(where.date as object), lte: new Date(to) };

  const shifts = await prisma.staffShift.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { date: 'asc' },
  });

  return NextResponse.json({ success: true, shifts });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 });
  }

  const staff = await prisma.dealerStaff.findFirst({
    where: { dealerId, userId: parsed.data.userId },
  });
  if (!staff) {
    return NextResponse.json({ error: 'Bu personel bu işletmeye bağlı değil' }, { status: 400 });
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

  return NextResponse.json({ success: true, shift });
}
