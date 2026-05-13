import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const createSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().max(500).optional(),
});

export async function GET() {
  try {
    const auth = await requireAuth(['STAFF']);
    if ('error' in auth) return auth.error;
    const userId = auth.session.user.id;

    const requests = await prisma.staffLeaveRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ success: true, requests }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('staff/leave GET:', error);
    return NextResponse.json(
      { error: 'Talepler yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['STAFF']);
    if ('error' in auth) return auth.error;
    const session = auth.session;
    const dealerId = getStaffDealerId(session);
    if (dealerId instanceof NextResponse) return dealerId;
    const userId = session.user.id;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const start = new Date(parsed.data.startDate);
    const end = new Date(parsed.data.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Geçersiz tarih' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }
    if (end < start) {
      return NextResponse.json({ error: 'Bitiş tarihi başlangıçtan önce olamaz' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const leave = await prisma.staffLeaveRequest.create({
      data: {
        dealerId,
        userId,
        startDate: start,
        endDate: end,
        reason: parsed.data.reason ?? null,
      },
    });

    return NextResponse.json({ success: true, request: leave }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('staff/leave POST:', error);
    return NextResponse.json(
      { error: 'Talep oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
