import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
});

export async function GET() {
  const auth = await requireAuth(['STAFF']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  const tasks = await prisma.staffTask.findMany({
    where: { assignedTo: userId },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
  });

  return NextResponse.json({ success: true, tasks });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(['STAFF']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('id');
  if (!taskId) {
    return NextResponse.json({ error: 'Task id gerekli' }, { status: 400 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Geçersiz status' }, { status: 400 });
  }

  const task = await prisma.staffTask.findFirst({
    where: { id: taskId, assignedTo: userId },
  });
  if (!task) {
    return NextResponse.json({ error: 'Görev bulunamadı' }, { status: 404 });
  }

  const updated = await prisma.staffTask.update({
    where: { id: taskId },
    data: {
      status: parsed.data.status,
      completedAt: parsed.data.status === 'completed' ? new Date() : null,
    },
  });

  return NextResponse.json({ success: true, task: updated });
}
