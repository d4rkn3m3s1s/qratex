import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { coarseLocationBucket, haversineKm } from '@/lib/innovation-geo';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';

export const dynamic = 'force-dynamic';

/**
 * Yakın çevre trendleri — adres yok; kaba bölge + anonim tema etiketleri.
 */
export async function GET(request: NextRequest) {
  const cfg = await getInnovationPlatformConfig();
  if (!cfg.features.nearbyRadar) {
    return NextResponse.json({ error: 'Özellik devre dışı' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lng = parseFloat(searchParams.get('lng') || '');
  const radiusKm = Math.min(parseFloat(searchParams.get('radiusKm') || '20') || 20, 80);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat ve lng gerekli' }, { status: 400 });
  }

  const bucket = coarseLocationBucket(lat, lng);
  const now = new Date();

  const dealers = await prisma.user.findMany({
    where: {
      role: 'DEALER',
      latitude: { not: null },
      longitude: { not: null },
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

  if (nearbyDealerIds.size === 0) {
    return NextResponse.json({
      regionBucket: bucket,
      radiusKm,
      topThemes: [],
      experienceHints: [],
      discoveryCards: [],
      disclaimer:
        'Konum kabaca gruplanmıştır; işletme adresi paylaşılmaz. Trendler toplu anonim özetdir.',
    });
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
      },
      select: { title: true },
      take: 80,
    }),
    prisma.dealerWeeklyBrief.findMany({
      where: { dealerId: { in: dealerIdList } },
      orderBy: { weekStart: 'desc' },
      take: 60,
      select: { topThemes: true },
    }),
    prisma.consumption.findMany({
      where: {
        dealerId: { in: dealerIdList },
        createdAt: { gte: since7 },
        productId: { not: null },
      },
      select: { product: { select: { name: true } } },
      take: 2500,
    }),
  ]);

  const productCounts = new Map<string, number>();
  for (const c of consumptions) {
    const n = c.product?.name;
    if (!n) continue;
    productCounts.set(n, (productCounts.get(n) || 0) + 1);
  }

  const discoveryCards = [...productCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, mentions]) => ({
      kind: 'local_taste' as const,
      label,
      mentions,
      blurb: `Bu bölgede son günlerde sık geçen lezzet`,
    }));

  const themeCounts = new Map<string, number>();
  for (const b of briefs) {
    const arr = b.topThemes as { theme?: string; count?: number }[] | null;
    if (!Array.isArray(arr)) continue;
    for (const t of arr) {
      if (typeof t.theme === 'string') {
        themeCounts.set(t.theme, (themeCounts.get(t.theme) || 0) + (t.count || 1));
      }
    }
  }

  const topThemes = [...themeCounts.entries()]
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

  return NextResponse.json({
    regionBucket: bucket,
    radiusKm,
    topThemes,
    experienceHints,
    discoveryCards: discoveryFallback,
    disclaimer:
      'Konum kabaca gruplanmıştır; işletme adresi paylaşılmaz. Trendler toplu anonim özetdir.',
  });
}
