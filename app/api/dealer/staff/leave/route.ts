import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const updateSchema = z.object({ status: z.enum(['approved', 'rejected']) });

export async function GET(request: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  const where: { dealerId: string; status?: string } = { dealerId };
  if (status) where.status = status;

  const requests = await prisma.staffLeaveRequest.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ success: true, requests });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz status' }, { status: 400 });
  }

  const leave = await prisma.staffLeaveRequest.findFirst({
    where: { id, dealerId, status: 'pending' },
  });
  if (!leave) {
    return NextResponse.json({ error: 'Talep bulunamadı veya zaten işlendi' }, { status: 404 });
  }

  const updated = await prisma.staffLeaveRequest.update({
    where: { id },
    data: { status: parsed.data.status },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({ success: true, request: updated });
}
