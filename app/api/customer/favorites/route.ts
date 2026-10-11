import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/** Favori üst sınırı: GET bu kadarını okur, POST bu sınırın üstüne eklemez. */
const FAVORITES_CAP = 500;

const favoritePostSchema = z.object({
  dealerId: z.string().min(1).max(64).transform((s) => s.trim()),
});

/** GET: Müşterinin favori işletme id listesi ve özet bilgileri */
export async function GET() {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;
  const limited = await enforceRouteRateLimit('customer.favorites.read', auth.session.user.id, 'read');
  if (limited) return limited;
  const { session } = auth;

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
      take: FAVORITES_CAP,
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
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;
  const limited = await enforceRouteRateLimit('customer.favorites.add', auth.session.user.id, 'mutation');
  if (limited) return limited;
  const { session } = auth;

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

    // Askıdaki ve demo işletmeler favorilenemez (Keşfet bunları zaten göstermez).
    const [dealer, count] = await Promise.all([
      prisma.user.findFirst({
        where: { id: dealerId, role: 'DEALER', isDemo: false, suspendedAt: null },
        select: { id: true },
      }),
      prisma.customerFavoriteDealer.count({ where: { userId: session.user.id } }),
    ]);
    if (!dealer) {
      return NextResponse.json(
        { error: 'İşletme bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    // Liste en fazla FAVORITES_CAP kayıt okur; sınırın üstündeki favori listede görünmeyeceği
    // için eklenmez (sessizce kaybolan kayıt yerine dürüst hata).
    if (count >= FAVORITES_CAP) {
      const already = await prisma.customerFavoriteDealer.findUnique({
        where: { userId_dealerId: { userId: session.user.id, dealerId } },
        select: { dealerId: true },
      });
      if (!already) {
        return NextResponse.json(
          { error: `En fazla ${FAVORITES_CAP} işletmeyi favorilere ekleyebilirsin.`, code: 'FAVORITES_LIMIT' },
          { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
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
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;
  const limited = await enforceRouteRateLimit('customer.favorites.remove', auth.session.user.id, 'mutation');
  if (limited) return limited;
  const { session } = auth;

  const dealerId = request.nextUrl.searchParams.get('dealerId')?.trim();
  if (!dealerId || dealerId.length > 64) {
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
