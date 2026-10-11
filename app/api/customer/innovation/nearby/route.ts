import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { ApiError, errorResponse } from '@/lib/http/define-route';
import { assertPlacesAccess } from '@/lib/places/gate.server';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { haversineKm } from '@/lib/innovation-geo';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { EXCLUDE_LEGACY_CHURN_FLASH } from '@/lib/churn-intervention-core';

export const dynamic = 'force-dynamic';

/**
 * Mutlu saat / flash — yakınımda (tam adres yok, mesafe + işletme adı).
 * Yalnız oturumlu MÜŞTERİ; Keşfet kapısı + dakikada 30 istek (denetim: anonim toplu kazıma).
 * Keşfet → Fırsatlar artık `/api/customer/places/deals` kullanır; bu uç geriye uyum içindir.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;
  try {
    await assertPlacesAccess(userId, request);
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e, 'flash-nearby');
    throw e;
  }
  const rl = await checkRateLimitDb(`innovation-nearby:${userId}`, 30, 60_000).catch(() => null);
  if (rl && !rl.ok) {
    return NextResponse.json({ error: 'Çok fazla istek. Biraz sonra tekrar deneyin.' }, { status: 429, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.flashOffers) {
    return NextResponse.json(
      { error: 'Özellik devre dışı' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  const radiusRaw = parseFloat(searchParams.get('radiusKm') || '15');
  const radiusKm = Math.min(Math.max(Number.isFinite(radiusRaw) ? radiusRaw : 15, 0.5), 50);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json(
      { error: 'lat ve lng gerekli' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const now = new Date();

  const offers = await prisma.dealerFlashOffer.findMany({
    where: {
      isActive: true,
      validFrom: { lte: now },
      validTo: { gte: now },
      // Kişiye özel churn taslakları (eski sürüm) herkese açık listeye ASLA girmez (P0-22).
      ...EXCLUDE_LEGACY_CHURN_FLASH,
      // Konum süzgeci DB'de (işletme sınırlayıcı kutusu): eskiden platformdaki TÜM aktif
      // tekliflerden sırasız 300'ü çekilip bellekte süzülüyordu → yakındakiler keyfi kayboluyordu.
      dealer: {
        isDemo: false,
        suspendedAt: null,
        latitude: { gte: lat - radiusKm / 111, lte: lat + radiusKm / 111 },
        longitude: {
          gte: lng - radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))),
          lte: lng + radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))),
        },
      },
    },
    orderBy: { validTo: 'asc' },
    include: {
      dealer: {
        select: {
          id: true,
          businessName: true,
          name: true,
          latitude: true,
          longitude: true,
          isDemo: true,
          suspendedAt: true,
        },
      },
    },
    take: 300,
  });

  const items: {
    id: string;
    title: string;
    body: string;
    offerType: string;
    value: number | null;
    validTo: string;
    distanceKm: number;
    venueLabel: string;
    dealerId: string;
  }[] = [];

  for (const o of offers) {
    const dlat = o.dealer.latitude;
    const dlng = o.dealer.longitude;
    if (dlat == null || dlng == null) continue;
    if (o.dealer.isDemo || o.dealer.suspendedAt) continue;
    const distanceKm = haversineKm(lat, lng, dlat, dlng);
    if (distanceKm > radiusKm) continue;
    if (o.redemptionCount >= o.maxRedemptions) continue;

    items.push({
      id: o.id,
      title: o.title,
      body: o.body,
      offerType: o.offerType,
      value: o.value,
      validTo: o.validTo.toISOString(),
      distanceKm: Math.round(distanceKm * 10) / 10,
      venueLabel: o.dealer.businessName || 'İşletme',
      dealerId: o.dealer.id,
    });
  }

  items.sort((a, b) => a.distanceKm - b.distanceKm);

  return NextResponse.json(
    {
      items: items.slice(0, 50),
      meta: { radiusKm, generatedAt: now.toISOString() },
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
