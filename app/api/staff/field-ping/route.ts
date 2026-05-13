import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth, getStaffDealerId } from '@/lib/api-auth';


export const dynamic = 'force-dynamic';

const postSchema = z.object({
  note: z.string().max(240).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export async function GET() {
  try {
  const auth = await requireAuth(['STAFF']);
  if ('error' in auth) return auth.error;
  const dealerId = getStaffDealerId(auth.session);
  if (dealerId instanceof NextResponse) return dealerId;

  const rows = await prisma.analyticsEvent.findMany({
    where: {
      event: 'staff_field_ping',
      category: 'staff_field',
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      data: { path: ['dealerId'], equals: dealerId },
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: { id: true, userId: true, data: true, createdAt: true },
  });

  return NextResponse.json({ success: true, pings: rows }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('staff/field-ping GET:', error);
    return NextResponse.json(
      { error: 'Kayıtlar yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
  const auth = await requireAuth(['STAFF']);
  if ('error' in auth) return auth.error;
  const dealerId = getStaffDealerId(auth.session);
  if (dealerId instanceof NextResponse) return dealerId;

  const json = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  await prisma.analyticsEvent.create({
    data: {
      userId: auth.session.user.id,
      event: 'staff_field_ping',
      category: 'staff_field',
      data: {
        dealerId,
        note: parsed.data.note ?? null,
        latitude: parsed.data.latitude ?? null,
        longitude: parsed.data.longitude ?? null,
      },
    },
  });

  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('staff/field-ping POST:', error);
    return NextResponse.json(
      { error: 'Kayıt oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
