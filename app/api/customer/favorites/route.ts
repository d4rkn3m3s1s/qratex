import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET: Müşterinin favori işletme id listesi ve özet bilgileri */
export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { session } = auth;
  if (session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    return NextResponse.json({
      success: true,
      data: favorites,
      dealerIds: favorites.map((f) => f.dealerId),
    });
  } catch (error) {
    console.error('Customer favorites GET error:', error);
    return NextResponse.json({ error: 'Favoriler alınamadı' }, { status: 500 });
  }
}

/** POST: Favorilere ekle. Body: { dealerId } */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { session } = auth;
  if (session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const dealerId = typeof body.dealerId === 'string' ? body.dealerId.trim() : null;
    if (!dealerId) {
      return NextResponse.json({ error: 'dealerId gerekli' }, { status: 400 });
    }

    const dealer = await prisma.user.findFirst({
      where: { id: dealerId, role: 'DEALER' },
    });
    if (!dealer) {
      return NextResponse.json({ error: 'İşletme bulunamadı' }, { status: 404 });
    }

    await prisma.customerFavoriteDealer.upsert({
      where: {
        userId_dealerId: { userId: session.user.id, dealerId },
      },
      create: { userId: session.user.id, dealerId },
      update: {},
    });

    return NextResponse.json({ success: true, added: true });
  } catch (error) {
    console.error('Customer favorites POST error:', error);
    return NextResponse.json({ error: 'Favorilere eklenemedi' }, { status: 500 });
  }
}

/** DELETE: Favorilerden çıkar. Query: ?dealerId= */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) return auth.error;
  const { session } = auth;
  if (session.user.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const dealerId = request.nextUrl.searchParams.get('dealerId');
  if (!dealerId) {
    return NextResponse.json({ error: 'dealerId gerekli' }, { status: 400 });
  }

  try {
    await prisma.customerFavoriteDealer.deleteMany({
      where: { userId: session.user.id, dealerId },
    });
    return NextResponse.json({ success: true, removed: true });
  } catch (error) {
    console.error('Customer favorites DELETE error:', error);
    return NextResponse.json({ error: 'Favorilerden çıkarılamadı' }, { status: 500 });
  }
}
