import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
});

export async function GET() {
  try {
    const auth = await requireAuth(['STAFF']);
    if ('error' in auth) return auth.error;
    const userId = auth.session.user.id;

    const tasks = await prisma.staffTask.findMany({
      where: { assignedTo: userId },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
      take: 200,
    });

    return NextResponse.json({ success: true, tasks }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('staff/tasks GET:', error);
    return NextResponse.json(
      { error: 'Görevler yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(['STAFF']);
    if ('error' in auth) return auth.error;
    const userId = auth.session.user.id;

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('id');
    if (!taskId || taskId.length > 64) {
      return NextResponse.json({ error: 'Task id gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz status' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const completedAt = parsed.data.status === 'completed' ? new Date() : null;
    const n = await prisma.staffTask.updateMany({
      where: { id: taskId, assignedTo: userId },
      data: {
        status: parsed.data.status,
        completedAt,
      },
    });
    if (n.count === 0) {
      return NextResponse.json({ error: 'Görev bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const updated = await prisma.staffTask.findUnique({ where: { id: taskId } });
    return NextResponse.json({ success: true, task: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('staff/tasks PATCH:', error);
    return NextResponse.json(
      { error: 'Görev güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
