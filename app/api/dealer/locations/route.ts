import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().min(1, 'Mekan adı gerekli').max(80),
  address: z.string().max(300).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
});

/** GET — bayinin mekanları (şube). */
export async function GET() {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  try {
    const locations = await prisma.dealerLocation.findMany({
      where: { dealerId: auth.session.user.id },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { qrCodes: true, remedyTemplates: true } } },
    });
    return NextResponse.json({ success: true, locations }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error listing locations:', error);
    return NextResponse.json(
      { error: 'Mekanlar getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

/** POST — yeni mekan oluştur. */
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

  try {
    const location = await prisma.dealerLocation.create({
      data: {
        dealerId,
        name: parsed.data.name,
        address: parsed.data.address ?? null,
        latitude: parsed.data.latitude ?? null,
        longitude: parsed.data.longitude ?? null,
      },
    });
    return NextResponse.json({ success: true, location }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    // @@unique([dealerId, name]) ihlali → aynı isim.
    if (error && typeof error === 'object' && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'Bu isimde bir mekan zaten var' },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error creating location:', error);
    return NextResponse.json(
      { error: 'Mekan oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
