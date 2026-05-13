import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['pending', 'assigned', 'in_progress', 'done', 'cancelled']).optional(),
  assignedToId: z.string().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['DEALER', 'ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const existing = await prisma.actionItem.findUnique({
      where: { id },
      select: { dealerId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Aksiyon bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (session.user.role === 'DEALER' && existing.dealerId !== session.user.id) {
      return NextResponse.json({ error: 'Bu aksiyonu güncelleme yetkiniz yok' }, { status: 403 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const data: {
      status?: string;
      assignedToId?: string | null;
      dueAt?: Date | null;
      completedAt?: Date | null;
    } = {};
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.assignedToId !== undefined) data.assignedToId = parsed.data.assignedToId;
    if (parsed.data.dueAt !== undefined) data.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
    if (parsed.data.completedAt !== undefined) {
      data.completedAt = parsed.data.completedAt ? new Date(parsed.data.completedAt) : null;
    }

    if (Object.keys(data).length === 0) {
      const row = await prisma.actionItem.findUnique({ where: { id } });
      if (!row) {
        return NextResponse.json({ error: 'Aksiyon bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      return NextResponse.json(row, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (session.user.role === 'ADMIN') {
      const n = await prisma.actionItem.updateMany({ where: { id }, data });
      if (n.count === 0) {
        return NextResponse.json({ error: 'Aksiyon bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
      }
      const updated = await prisma.actionItem.findUnique({ where: { id } });
      return NextResponse.json(updated, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const n = await prisma.actionItem.updateMany({
      where: { id, dealerId: session.user.id },
      data,
    });
    if (n.count === 0) {
      return NextResponse.json({ error: 'Aksiyon bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    const updated = await prisma.actionItem.findUnique({ where: { id } });
    if (!updated) {
      return NextResponse.json({ error: 'Aksiyon bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    return NextResponse.json(updated, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('action-items PATCH:', error);
    return NextResponse.json(
      { error: 'Güncelleme başarısız' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
