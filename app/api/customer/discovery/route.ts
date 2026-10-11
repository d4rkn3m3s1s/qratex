import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDiscoveryConfig } from '@/lib/discovery-config';
import { computeDiscovery } from '@/lib/discovery/compute.server';
import { assertMenuItemVisible, assertModuleEnabled } from '@/lib/module-gate';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

/** getServerSession / gates — not compatible with static rendering during build. */
export const dynamic = 'force-dynamic';

const DISCOVERY_FAVORITES_CAP = 500;

/**
 * GET /api/customer/discovery — keşif verisi (trend, haftanın enleri, sponsorlu, yakındakiler,
 * canlı mutlu saatler). Hesap `lib/discovery/compute.server.ts` içinde; admin önizlemesi de
 * aynı fonksiyonu kullanır. `isOpenNow` İstanbul saatiyle, önce bayi profilinden; bilinmiyorsa
 * `null` (09–23 varsayımı yok).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const menuGate = await assertMenuItemVisible('nearby', 'customer', {
      request,
      userId: session.user.id,
      routeKey: '/customer/nearby',
    });
    if (menuGate) return menuGate;
    const gate = await assertModuleEnabled('discovery', {
      role: 'customer',
      request,
      userId: session.user.id,
      routeKey: '/customer/nearby',
    });
    if (gate) return gate;

    const { searchParams } = new URL(request.url);
    const latRaw = searchParams.get('lat');
    const lngRaw = searchParams.get('lng');
    const lat = latRaw === null || latRaw === '' ? null : Number(latRaw);
    const lng = lngRaw === null || lngRaw === '' ? null : Number(lngRaw);
    const radiusKm = Number(searchParams.get('radiusKm') || '5');

    const [config, favs] = await Promise.all([
      getDiscoveryConfig(),
      prisma.customerFavoriteDealer.findMany({
        where: { userId: session.user.id },
        select: { dealerId: true },
        take: DISCOVERY_FAVORITES_CAP,
      }),
    ]);
    const data = await computeDiscovery(prisma, config, {
      lat: lat !== null && Number.isFinite(lat) ? lat : null,
      lng: lng !== null && Number.isFinite(lng) ? lng : null,
      radiusKm: Number.isFinite(radiusKm) ? radiusKm : 5,
      category: searchParams.get('category') || 'all',
    });

    return NextResponse.json(
      { success: true, data: { ...data, favoriteDealerIds: favs.map((f) => f.dealerId) } },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Customer discovery error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ success: false, error: 'Keşif verileri alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
