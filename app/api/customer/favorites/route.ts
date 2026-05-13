import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const favoritePostSchema = z.object({
  dealerId: z.string().min(1).max(64).transform((s) => s.trim()),
});

/** GET: Müşterinin favori işletme id listesi ve özet bilgileri */
export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { session } = auth;
  if (session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
  }

  try {
    const list = await prisma.customerFavoriteDealer.findMany({
      where: { userId: session.user.id },
      include: {
        dealer: {
          select: {
            id: true,
            businessName: true,
            businessLogo: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const favorites = list.map((f) => ({
      dealerId: f.dealerId,
      addedAt: f.createdAt,
      businessName: f.dealer.businessName,
      businessLogo: f.dealer.businessLogo,
      address: f.dealer.address,
      latitude: f.dealer.latitude,
      longitude: f.dealer.longitude,
    }));

    return NextResponse.json(
      {
        success: true,
        data: favorites,
        dealerIds: favorites.map((f) => f.dealerId),
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Customer favorites GET error:', error);
    return NextResponse.json(
      { error: 'Favoriler alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

/** POST: Favorilere ekle. Body: { dealerId } */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { session } = auth;
  if (session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
  }

  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = favoritePostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Geçersiz dealerId' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const dealerId = parsed.data.dealerId;

    const dealer = await prisma.user.findFirst({
      where: { id: dealerId, role: 'DEALER' },
    });
    if (!dealer) {
      return NextResponse.json(
        { error: 'İşletme bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    await prisma.customerFavoriteDealer.upsert({
      where: {
        userId_dealerId: { userId: session.user.id, dealerId },
      },
      create: { userId: session.user.id, dealerId },
      update: {},
    });

    return NextResponse.json({ success: true, added: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Customer favorites POST error:', error);
    return NextResponse.json(
      { error: 'Favorilere eklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

/** DELETE: Favorilerden çıkar. Query: ?dealerId= */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { session } = auth;
  if (session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const dealerId = request.nextUrl.searchParams.get('dealerId');
  if (!dealerId) {
    return NextResponse.json(
      { error: 'dealerId gerekli' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  try {
    await prisma.customerFavoriteDealer.deleteMany({
      where: { userId: session.user.id, dealerId },
    });
    return NextResponse.json({ success: true, removed: true }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Customer favorites DELETE error:', error);
    return NextResponse.json(
      { error: 'Favorilerden çıkarılamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
