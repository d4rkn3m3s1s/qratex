import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  unit: z.string().min(1).max(20).optional(),
  values: z.array(z.number().nonnegative()).min(1).max(8).optional(),
  order: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

async function assertOwned(
  templateId: string,
  dealerId: string
): Promise<NextResponse | null> {
  const tpl = await prisma.remedyTemplate.findUnique({
    where: { id: templateId },
    select: { dealerId: true },
  });
  if (!tpl) {
    return NextResponse.json(
      { error: 'Şablon bulunamadı' },
      { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  if (tpl.dealerId !== dealerId) {
    return NextResponse.json(
      { error: 'Bu şablona erişim yetkiniz yok' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
  return null;
}

/** PATCH — şablonu güncelle. (type ve locationId değiştirilemez; yeni şablon oluşturun.) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const forbidden = await assertOwned(id, auth.session.user.id);
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
    const template = await prisma.remedyTemplate.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({ success: true, template }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error updating remedy template:', error);
    return NextResponse.json(
      { error: 'Şablon güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

/** DELETE — şablonu sil. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const forbidden = await assertOwned(id, auth.session.user.id);
  if (forbidden) return forbidden;

  try {
    await prisma.remedyTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Error deleting remedy template:', error);
    return NextResponse.json(
      { error: 'Şablon silinemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
