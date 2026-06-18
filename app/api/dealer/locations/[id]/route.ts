import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  address: z.string().max(300).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  isActive: z.boolean().optional(),
});

async function assertOwned(
  locationId: string,
  dealerId: string
): Promise<NextResponse | null> {
  const loc = await prisma.dealerLocation.findUnique({
    where: { id: locationId },
    select: { dealerId: true },
  });
  if (!loc) {
    return NextResponse.json(
      { error: 'Mekan bulunamadı' },
      { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  if (loc.dealerId !== dealerId) {
    return NextResponse.json(
      { error: 'Bu mekana erişim yetkiniz yok' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  return null;
}

/** PATCH — mekanı güncelle. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;
  const { id } = await params;

  const forbidden = await assertOwned(id, dealerId);
  if (forbidden) return forbidden;

  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  try {
    const location = await prisma.dealerLocation.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({ success: true, location }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (error && typeof error === 'object' && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'Bu isimde bir mekan zaten var' },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error updating location:', error);
    return NextResponse.json(
      { error: 'Mekan güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

/**
 * DELETE — mekanı sil. Bağlı QR kodların locationId'si SetNull olur (şema),
 * mekana özel şablonlar Cascade ile silinir.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const dealerId = auth.session.user.id;
  const { id } = await params;

  const forbidden = await assertOwned(id, dealerId);
  if (forbidden) return forbidden;

  try {
    await prisma.dealerLocation.delete({ where: { id } });
    return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error deleting location:', error);
    return NextResponse.json(
      { error: 'Mekan silinemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
