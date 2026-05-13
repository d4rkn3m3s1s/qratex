import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { haversineKm } from '@/lib/innovation-geo';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * Mutlu saat / flash — yakınımda (tam adres yok, mesafe + işletme adı).
 */
export async function GET(request: NextRequest) {
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
  const radiusKm = Math.min(parseFloat(searchParams.get('radiusKm') || '15') || 15, 50);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
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
    },
    include: {
      dealer: {
        select: {
          id: true,
          businessName: true,
          name: true,
          latitude: true,
          longitude: true,
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
      venueLabel: o.dealer.businessName || o.dealer.name || 'İşletme',
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
