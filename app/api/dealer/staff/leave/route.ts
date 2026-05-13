import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const updateSchema = z.object({ status: z.enum(['approved', 'rejected']) });

export async function GET(request: NextRequest) {
  try {
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
      take: 200,
    });

    return NextResponse.json({ success: true, requests }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('dealer/staff/leave GET:', error);
    return NextResponse.json(
      { error: 'Talepler yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(['DEALER']);
    if ('error' in auth) return auth.error;
    const dealerId = auth.session.user.id;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id || id.length > 64) {
      return NextResponse.json({ error: 'id gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz status' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const n = await prisma.staffLeaveRequest.updateMany({
      where: { id, dealerId, status: 'pending' },
      data: { status: parsed.data.status },
    });
    if (n.count === 0) {
      return NextResponse.json(
        { error: 'Talep bulunamadı veya zaten işlendi' },
        { status: 404 , headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const updated = await prisma.staffLeaveRequest.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({ success: true, request: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('dealer/staff/leave PATCH:', error);
    return NextResponse.json(
      { error: 'Talep güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
