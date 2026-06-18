import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const REMEDY_TYPES = ['discount', 'points', 'free_item'] as const;

const createSchema = z.object({
  locationId: z.string().optional().nullable(), // null = işletme geneli
  type: z.enum(REMEDY_TYPES),
  label: z.string().min(1).max(60),
  unit: z.string().min(1).max(20),
  values: z.array(z.number().nonnegative()).min(1, 'En az bir değer girin').max(8),
  order: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

/** GET — bayinin telafi şablonları. ?locationId= ile mekana göre filtrelenebilir. */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const { searchParams } = new URL(req.url);
  const locationParam = searchParams.get('locationId');

  // locationId=__global__ → sadece işletme geneli; belirli id → o mekan; yoksa hepsi.
  const where: { dealerId: string; locationId?: string | null } = { dealerId };
  if (locationParam === '__global__') where.locationId = null;
  else if (locationParam) where.locationId = locationParam;

  try {
    const templates = await prisma.remedyTemplate.findMany({
      where,
      orderBy: [{ locationId: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json({ success: true, templates }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error listing remedy templates:', error);
    return NextResponse.json(
      { error: 'Şablonlar getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

/** POST — yeni telafi şablonu. */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  // locationId verildiyse bu bayiye ait olmalı.
  if (parsed.data.locationId) {
    const loc = await prisma.dealerLocation.findUnique({
      where: { id: parsed.data.locationId },
      select: { dealerId: true },
    });
    if (!loc || loc.dealerId !== dealerId) {
      return NextResponse.json(
        { error: 'Geçersiz mekan' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
  }

  try {
    const template = await prisma.remedyTemplate.create({
      data: {
        dealerId,
        locationId: parsed.data.locationId ?? null,
        type: parsed.data.type,
        label: parsed.data.label,
        unit: parsed.data.unit,
        values: parsed.data.values,
        order: parsed.data.order ?? 0,
        isActive: parsed.data.isActive ?? true,
      },
    });
    return NextResponse.json({ success: true, template }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error creating remedy template:', error);
    return NextResponse.json(
      { error: 'Şablon oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
