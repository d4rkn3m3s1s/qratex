import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/** GET: kullanıcının kendi görünümleri + ekip geneline paylaşılan (isShared) görünümler. */
export async function GET() {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const views = await prisma.teamSavedView.findMany({
    where: { OR: [{ userId: auth.session.user.id }, { isShared: true }] },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ success: true, views }, { headers: PRIVATE_NO_STORE_HEADERS });
}

const createSchema = z.object({
  name: z.string().min(1).max(60),
  config: z.record(z.unknown()), // serbest yapı; Prisma Json olarak saklanır
  isShared: z.boolean().optional(),
});

/** POST: yeni kaydedilmiş görünüm oluştur. Sahibi = giriş yapan kullanıcı. */
export async function POST(req: NextRequest) {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const raw = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Geçersiz görünüm verisi' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const d = parsed.data;
  const view = await prisma.teamSavedView.create({
    data: {
      userId: auth.session.user.id,
      name: d.name,
      config: d.config as Prisma.InputJsonValue,
      isShared: d.isShared ?? false,
    },
  });
  return NextResponse.json({ success: true, view }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** DELETE ?id=: görünüm sil. Yalnızca sahibi silebilir. */
export async function DELETE(req: NextRequest) {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: 'id gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });

  const existing = await prisma.teamSavedView.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ success: false, error: 'Görünüm bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
  }
  // Sahiplik kontrolü — yalnızca oluşturan kullanıcı silebilir.
  if (existing.userId !== auth.session.user.id) {
    return NextResponse.json({ success: false, error: 'Bu görünümü silme yetkiniz yok.' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
  }
  await prisma.teamSavedView.delete({ where: { id } });
  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
