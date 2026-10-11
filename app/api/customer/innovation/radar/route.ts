import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { ApiError, errorResponse } from '@/lib/http/define-route';
import { assertPlacesAccess } from '@/lib/places/gate.server';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { coarseLocationBucket, haversineKm } from '@/lib/innovation-geo';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { EXCLUDE_LEGACY_CHURN_FLASH } from '@/lib/churn-intervention-core';

export const dynamic = 'force-dynamic';

/** Yarıçap alt sınırı: tek işletmenin koordinatına daraltılmış sorguyla o işletmenin verisi okunamasın. */
const MIN_RADIUS_KM = 2;
const MAX_RADIUS_KM = 80;
/** k-anonimlik: bölgede bu kadar işletme yoksa tema/ürün özeti DÖNMEZ (tek işletmeye indirgenemez). */
const MIN_DEALERS_FOR_AGGREGATE = 5;
/** Bir ürün/tema en az bu kadar FARKLI işletmede görülmeden listelenmez. */
const MIN_DEALERS_PER_ITEM = 2;
const DISCLAIMER = 'Konum kabaca gruplanmıştır; işletme adresi paylaşılmaz. Trendler toplu anonim özettir.';

/**
 * Yakın çevre trendleri — adres yok; kaba bölge + anonim tema etiketleri.
 * Yalnız oturumlu MÜŞTERİ; Keşfet kapısı (menü + discovery modülü) ve dakikada 30 istek
 * (denetim: uç anonim erişime ve toplu kazımaya açıktı). Demo/askıdaki işletmeler hariç.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) return auth.error;
  const userId = auth.session.user.id;
  try {
    await assertPlacesAccess(userId, request);
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e, 'radar');
    throw e;
  }
  const rl = await checkRateLimitDb(`innovation-radar:${userId}`, 30, 60_000).catch(() => null);
  if (rl && !rl.ok) {
    return NextResponse.json({ error: 'Çok fazla istek. Biraz sonra tekrar deneyin.' }, { status: 429, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.nearbyRadar) {
    return NextResponse.json(
      { error: 'Özellik devre dışı' },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  const radiusRaw = parseFloat(searchParams.get('radiusKm') || '20');
  const radiusKm = Math.min(Math.max(Number.isFinite(radiusRaw) ? radiusRaw : 20, MIN_RADIUS_KM), MAX_RADIUS_KM);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json(
      { error: 'lat ve lng gerekli' },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const bucket = coarseLocationBucket(lat, lng);
  const now = new Date();

  // Sınırlayıcı kutu DB'de (enlem + boylam): eskiden yalnız enlem bandı + sırasız take:400
  // vardı; kalabalık bantta yakındaki işletmeler keyfi biçimde dışarıda kalabiliyordu.
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const dealers = await prisma.user.findMany({
    where: {
      role: 'DEALER',
      isDemo: false,
      suspendedAt: null,
      latitude: { gte: lat - latDelta, lte: lat + latDelta },
      longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
    },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      businessName: true,
    },
    take: 400,
  });

  const nearbyDealerIds = new Set<string>();
  for (const d of dealers) {
    if (d.latitude == null || d.longitude == null) continue;
    if (haversineKm(lat, lng, d.latitude, d.longitude) <= radiusKm) {
      nearbyDealerIds.add(d.id);
    }
  }

  if (nearbyDealerIds.size < MIN_DEALERS_FOR_AGGREGATE) {
    // Az işletmeli bölgede "toplu anonim özet" tek işletmenin özel verisine (geri bildirim
    // temaları, satış adetleri) indirgenir → özet üretilmez, nedeni dürüstçe söylenir.
    return NextResponse.json(
      {
        regionBucket: bucket,
        radiusKm,
        topThemes: [],
        experienceHints: [],
        discoveryCards: [],
        insufficientData: nearbyDealerIds.size > 0,
        disclaimer:
          nearbyDealerIds.size > 0
            ? 'Bu bölgede anonim bir özet çıkaracak kadar işletme yok; trendler daha geniş bir alanda görünür.'
            : DISCLAIMER,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  const dealerIdList = [...nearbyDealerIds];

  const since7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const [flashes, briefs, consumptions] = await Promise.all([
    prisma.dealerFlashOffer.findMany({
      where: {
        dealerId: { in: dealerIdList },
        isActive: true,
        validFrom: { lte: now },
        validTo: { gte: now },
        // Kişiye özel churn taslakları (eski sürüm) herkese açık listeye ASLA girmez (P0-22).
        ...EXCLUDE_LEGACY_CHURN_FLASH,
      },
      select: { title: true },
      take: 80,
    }),
    prisma.dealerWeeklyBrief.findMany({
      where: { dealerId: { in: dealerIdList } },
      orderBy: { weekStart: 'desc' },
      take: 60,
      select: { dealerId: true, topThemes: true },
    }),
    prisma.consumption.findMany({
      where: {
        dealerId: { in: dealerIdList },
        createdAt: { gte: since7 },
        productId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { dealerId: true, product: { select: { name: true } } },
      take: 1000,
    }),
  ]);

  const productCounts = new Map<string, number>();
  const productDealers = new Map<string, Set<string>>();
  for (const c of consumptions) {
    const n = c.product?.name;
    if (!n) continue;
    productCounts.set(n, (productCounts.get(n) || 0) + 1);
    const set = productDealers.get(n) ?? new Set<string>();
    set.add(c.dealerId);
    productDealers.set(n, set);
  }

  const discoveryCards = [...productCounts.entries()]
    .filter(([label]) => (productDealers.get(label)?.size ?? 0) >= MIN_DEALERS_PER_ITEM)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, mentions]) => ({
      kind: 'local_taste' as const,
      label,
      mentions,
      blurb: `Bu bölgede son günlerde sık geçen lezzet`,
    }));

  const themeCounts = new Map<string, number>();
  const themeDealers = new Map<string, Set<string>>();
  for (const b of briefs) {
    const arr = b.topThemes as { theme?: string; count?: number }[] | null;
    if (!Array.isArray(arr)) continue;
    for (const t of arr) {
      if (typeof t.theme === 'string') {
        themeCounts.set(t.theme, (themeCounts.get(t.theme) || 0) + (t.count || 1));
        const set = themeDealers.get(t.theme) ?? new Set<string>();
        set.add(b.dealerId);
        themeDealers.set(t.theme, set);
      }
    }
  }

  const topThemes = [...themeCounts.entries()]
    .filter(([label]) => (themeDealers.get(label)?.size ?? 0) >= MIN_DEALERS_PER_ITEM)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, weight]) => ({ label, weight }));

  const experienceHints = [...new Set(flashes.map((f) => f.title))].slice(0, 12);

  const discoveryFallback =
    discoveryCards.length === 0
      ? topThemes.slice(0, 3).map((t) => ({
          kind: 'theme' as const,
          label: t.label,
          mentions: t.weight,
          blurb: 'Geri bildirim temalarından özet',
        }))
      : discoveryCards;

  return NextResponse.json(
    {
      regionBucket: bucket,
      radiusKm,
      topThemes,
      experienceHints,
      discoveryCards: discoveryFallback,
      disclaimer: DISCLAIMER,
    },
    { headers: PRIVATE_NO_STORE_HEADERS }
  );
}
