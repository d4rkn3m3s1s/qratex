import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const clockSchema = z.object({
  shiftId: z.string(),
  action: z.enum(['clock_in', 'clock_out']),
});

export async function GET(request: NextRequest) {
  try {
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

    return NextResponse.json({ success: true, shifts }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('staff/shifts GET:', error);
    return NextResponse.json(
      { error: 'Vardiyalar yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(['STAFF']);
    if ('error' in auth) return auth.error;
    const userId = auth.session.user.id;

    const body = await request.json();
    const parsed = clockSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (parsed.data.shiftId.length > 64) {
      return NextResponse.json({ error: 'Geçersiz vardiya' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const now = new Date();
    const data =
      parsed.data.action === 'clock_in'
        ? { clockInAt: now }
        : { clockOutAt: now };

    const n = await prisma.staffShift.updateMany({
      where: { id: parsed.data.shiftId, userId },
      data,
    });
    if (n.count === 0) {
      return NextResponse.json({ error: 'Vardiya bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const updated = await prisma.staffShift.findUnique({ where: { id: parsed.data.shiftId } });
    return NextResponse.json({ success: true, shift: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('staff/shifts PATCH:', error);
    return NextResponse.json(
      { error: 'Vardiya güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
