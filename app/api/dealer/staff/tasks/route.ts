import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const createSchema = z.object({
  assignedTo: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueAt: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  const where: { dealerId: string; assignedTo?: string } = { dealerId };
  if (userId) where.assignedTo = userId;

  const tasks = await prisma.staffTask.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    take: 500,
  });

  return NextResponse.json({ success: true, tasks }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Geçersiz veri' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const staff = await prisma.dealerStaff.findFirst({
    where: { dealerId, userId: parsed.data.assignedTo },
  });
  if (!staff) {
    return NextResponse.json(
      { error: 'Bu personel bu işletmeye bağlı değil' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const task = await prisma.staffTask.create({
    data: {
      dealerId,
      assignedTo: parsed.data.assignedTo,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ success: true, task }, { headers: PRIVATE_NO_STORE_HEADERS });
}
