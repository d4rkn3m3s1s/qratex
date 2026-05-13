import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDiscoveryConfig } from '@/lib/discovery-config';
import { isHappyHourLive } from '@/lib/happy-hour-live';
import { assertMenuItemVisible, assertModuleEnabled } from '@/lib/module-gate';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

/** getServerSession / gates — not compatible with static rendering during build. */
export const dynamic = 'force-dynamic';

/** Son N kayıt üzerinden trend; tüm tabloyu RAM’e çekmeyi önler */
const DISCOVERY_FEEDBACK_CAP = 25_000;
const DISCOVERY_REVIEW_CAP = 20_000;
const DISCOVERY_NEARBY_DEALER_CAP = 2_000;
const DISCOVERY_FAVORITES_CAP = 500;
const DISCOVERY_HAPPY_HOUR_CAP = 200;

async function fetchQRCodesByIds(ids: string[]) {
  const unique = [...new Set(ids)].filter(Boolean);
  const chunkSize = 8_000;
  const rows: { id: string; dealerId: string; scanCount: number | null }[] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const slice = unique.slice(i, i + chunkSize);
    const part = await prisma.qRCode.findMany({
      where: { id: { in: slice } },
      select: { id: true, dealerId: true, scanCount: true },
    });
    rows.push(...part);
  }
  return rows;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function normalizeCategoryLabel(value: string): string {
  const text = value.toLowerCase();
  if (text.includes('kahve') || text.includes('coffee')) return 'kahve';
  if (text.includes('tatlı') || text.includes('tatli') || text.includes('dessert')) return 'tatlı';
  if (
    text.includes('yemek') ||
    text.includes('food') ||
    text.includes('restoran') ||
    text.includes('restaurant')
  ) {
    return 'yemek';
  }
  return text.trim();
}

function parseTimeValue(value: string | undefined, fallbackMinutes: number): number {
  if (!value) return fallbackMinutes;
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw ?? '0');
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallbackMinutes;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallbackMinutes;
  return hour * 60 + minute;
}

function computeIsOpenNow(schedule: { opensAt?: string; closesAt?: string; daysOfWeek?: number[] } | undefined, now: Date): boolean {
  const openMinutes = parseTimeValue(schedule?.opensAt, 9 * 60);
  const closeMinutes = parseTimeValue(schedule?.closesAt, 23 * 60);
  const day = now.getDay();
  const allowedDays = schedule?.daysOfWeek && schedule.daysOfWeek.length > 0 ? schedule.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  if (!allowedDays.includes(day)) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (closeMinutes < openMinutes) {
    // Overnight schedule (e.g. 18:00 - 02:00)
    return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
  }
  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
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
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    const radiusKm = Math.max(0.1, Number(searchParams.get('radiusKm') || '5'));
    const category = (searchParams.get('category') || 'all').toLowerCase();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [config, recentFeedbacks, recentConsumptionReviews] = await Promise.all([
      getDiscoveryConfig(),
      prisma.feedback.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
        select: {
          rating: true,
          qrCodeId: true,
        },
        orderBy: { createdAt: 'desc' },
        take: DISCOVERY_FEEDBACK_CAP,
      }),
      prisma.consumptionReview.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        select: {
          rating: true,
          dimensions: true,
          consumption: {
            select: {
              dealerId: true,
              dealer: { select: { id: true, businessName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: DISCOVERY_REVIEW_CAP,
      }),
    ]);

    const qrIds = recentFeedbacks.map((f) => f.qrCodeId);
    const qrCodes = await fetchQRCodesByIds(qrIds);

    const qrMap = new Map<string, { dealerId: string; scanCount: number }>();
    const dealerIds = new Set<string>();
    qrCodes.forEach((row) => {
      qrMap.set(row.id, { dealerId: row.dealerId, scanCount: row.scanCount ?? 0 });
      dealerIds.add(row.dealerId);
    });
    const dealers =
      dealerIds.size === 0
        ? []
        : await prisma.user.findMany({
            where: { id: { in: Array.from(dealerIds) } },
            select: { id: true, businessName: true, image: true },
            take: 5_000,
          });
    const dealerMap = new Map(dealers.map((dealer) => [dealer.id, dealer]));

    const venueMap = new Map<
      string,
      {
        dealerId: string;
        businessName: string;
        image: string | null;
        feedbackCount: number;
        ratingSum: number;
        scanCount: number;
      }
    >();

    for (const feedback of recentFeedbacks) {
      const qr = qrMap.get(feedback.qrCodeId);
      if (!qr) continue;
      const dealer = dealerMap.get(qr.dealerId);
      const dealerId = qr.dealerId;
      const businessName = dealer?.businessName || 'İşletme';
      const entry = venueMap.get(dealerId) || {
        dealerId,
        businessName,
        image: dealer?.image || null,
        feedbackCount: 0,
        ratingSum: 0,
        scanCount: qr.scanCount || 0,
      };
      entry.feedbackCount += 1;
      entry.ratingSum += feedback.rating || 0;
      entry.scanCount = Math.max(entry.scanCount, qr.scanCount || 0);
      venueMap.set(dealerId, entry);
    }

    const trendingVenues = Array.from(venueMap.values())
      .map((entry) => {
        const avgRating = entry.feedbackCount > 0 ? entry.ratingSum / entry.feedbackCount : 0;
        const score = Math.round(avgRating * 20 + Math.min(30, entry.feedbackCount * 1.5) + Math.min(20, entry.scanCount / 10));
        return {
          dealerId: entry.dealerId,
          businessName: entry.businessName,
          image: entry.image,
          feedbackCount: entry.feedbackCount,
          avgRating: Number(avgRating.toFixed(2)),
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const weeklyDimension = {
      ambience: new Map<string, number[]>(),
      food: new Map<string, number[]>(),
      service: new Map<string, number[]>(),
    };

    for (const review of recentConsumptionReviews) {
      const dealerId = review.consumption?.dealerId;
      if (!dealerId) continue;
      const businessName = review.consumption?.dealer?.businessName || 'İşletme';
      const dims = review.dimensions && typeof review.dimensions === 'object' ? (review.dimensions as Record<string, unknown>) : {};
      const ambience = typeof dims.ambience === 'number' ? dims.ambience : review.rating || 0;
      const food = typeof dims.taste === 'number' ? dims.taste : review.rating || 0;
      const service = typeof dims.service === 'number' ? dims.service : review.rating || 0;

      const key = `${dealerId}::${businessName}`;
      if (!weeklyDimension.ambience.has(key)) weeklyDimension.ambience.set(key, []);
      if (!weeklyDimension.food.has(key)) weeklyDimension.food.set(key, []);
      if (!weeklyDimension.service.has(key)) weeklyDimension.service.set(key, []);
      weeklyDimension.ambience.get(key)?.push(ambience);
      weeklyDimension.food.get(key)?.push(food);
      weeklyDimension.service.get(key)?.push(service);
    }

    const pickBest = (bucket: Map<string, number[]>) => {
      let winner: { dealerId: string; businessName: string; score: number } | null = null;
      for (const [key, scores] of Array.from(bucket.entries())) {
        if (scores.length === 0) continue;
        const [dealerId, businessName] = key.split('::');
        const score = scores.reduce((sum: number, value: number) => sum + value, 0) / scores.length;
        if (!winner || score > winner.score) {
          winner = { dealerId, businessName, score: Number(score.toFixed(2)) };
        }
      }
      return winner;
    };

    const weeklyBest = [
      { key: 'ambience', label: config.weeklyHighlights.ambienceLabel, winner: pickBest(weeklyDimension.ambience) },
      { key: 'food', label: config.weeklyHighlights.foodLabel, winner: pickBest(weeklyDimension.food) },
      { key: 'service', label: config.weeklyHighlights.serviceLabel, winner: pickBest(weeklyDimension.service) },
    ];

    const now = new Date();
    const sponsored = config.sponsored
      .filter((item) => {
        if (!item.isActive) return false;
        if (item.startsAt && new Date(item.startsAt) > now) return false;
        if (item.endsAt && new Date(item.endsAt) < now) return false;
        return true;
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 10);

    let nearby: Array<{
      dealerId: string;
      businessName: string;
      image: string | null;
      phone: string | null;
      address?: string;
      distanceKm: number;
      categories: string[];
      avgRating: number;
      trendScore: number;
      feedbackCount: number;
      isOpenNow: boolean;
    }> = [];

    let liveBoosts: Array<{
      dealerId: string | null;
      businessName: string;
      happyHourName: string;
      multiplier: number;
      distanceKm: number;
      scope: 'dealer' | 'global';
    }> = [];

    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      const nowTime = new Date();
      const configLocationByDealerId = new Map(
        config.locations.map((item) => [
          item.dealerId,
          {
            latitude: item.latitude,
            longitude: item.longitude,
            address: item.address,
          },
        ])
      );
      const categoryByDealerId = new Map<string, string[]>(
        config.locations.map((item) => [item.dealerId, item.categories.map((entry) => normalizeCategoryLabel(entry))])
      );
      const scheduleByDealerId = new Map(
        config.locations.map((item) => [
          item.dealerId,
          { opensAt: item.opensAt, closesAt: item.closesAt, daysOfWeek: item.daysOfWeek },
        ])
      );
      const scoreByDealerId = new Map(
        trendingVenues.map((item) => [item.dealerId, { avgRating: item.avgRating, trendScore: item.score, feedbackCount: item.feedbackCount }])
      );

      const configDealerIds = config.locations.map((entry) => entry.dealerId);
      const padLat = Math.max(0.05, (radiusKm / 111) * 1.35);
      const cosLat = Math.cos(toRadians(lat));
      const padLng =
        Math.abs(cosLat) > 0.02 ? Math.max(0.05, ((radiusKm / 111) * 1.35) / cosLat) : 180;

      const dealers = await prisma.user.findMany({
        where: {
          role: 'DEALER',
          OR: [
            {
              AND: [
                { latitude: { not: null } },
                { longitude: { not: null } },
                { latitude: { gte: lat - padLat, lte: lat + padLat } },
                { longitude: { gte: lng - padLng, lte: lng + padLng } },
              ],
            },
            { id: { in: configDealerIds } },
          ],
        },
        select: {
          id: true,
          businessName: true,
          image: true,
          phone: true,
          address: true,
          latitude: true,
          longitude: true,
        },
        take: DISCOVERY_NEARBY_DEALER_CAP,
      });

      const categoryScope = [...new Set([...dealers.map((d) => d.id), ...configDealerIds])];
      const dealerCategories =
        categoryScope.length === 0
          ? []
          : await prisma.productCategory.findMany({
              where: {
                dealerId: { in: categoryScope },
                isActive: true,
              },
              select: {
                dealerId: true,
                name: true,
              },
              take: 8_000,
            });

      dealerCategories.forEach((row) => {
        if (!row.dealerId) return;
        const existing = categoryByDealerId.get(row.dealerId) || [];
        const normalized = normalizeCategoryLabel(row.name);
        if (!normalized) return;
        if (!existing.includes(normalized)) {
          existing.push(normalized);
        }
        categoryByDealerId.set(row.dealerId, existing);
      });

      nearby = dealers
        .map((dealer) => {
          const configLocation = configLocationByDealerId.get(dealer.id);
          const sourceLatitude = dealer.latitude ?? configLocation?.latitude ?? null;
          const sourceLongitude = dealer.longitude ?? configLocation?.longitude ?? null;
          if (sourceLatitude === null || sourceLongitude === null) return null;
          const distanceKm = haversineDistanceKm(lat, lng, sourceLatitude, sourceLongitude);
          return {
            dealerId: dealer.id,
            businessName: dealer.businessName || 'İşletme',
            image: dealer.image || null,
            phone: dealer.phone || null,
            address: dealer.address || configLocation?.address || undefined,
            distanceKm: Number(distanceKm.toFixed(2)),
            categories: categoryByDealerId.get(dealer.id) || [],
            avgRating: scoreByDealerId.get(dealer.id)?.avgRating || 0,
            trendScore: scoreByDealerId.get(dealer.id)?.trendScore || 0,
            feedbackCount: scoreByDealerId.get(dealer.id)?.feedbackCount || 0,
            isOpenNow: computeIsOpenNow(scheduleByDealerId.get(dealer.id), nowTime),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .filter((item) => item.distanceKm <= radiusKm)
        .filter((item) => category === 'all' || item.categories.includes(category))
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 20);

      const dealerIdsInRadius = new Set(nearby.map((n) => n.dealerId));
      const happyHours = await prisma.happyHour.findMany({
        where: {
          isActive: true,
          OR: [{ dealerId: null }, { dealerId: { in: Array.from(dealerIdsInRadius) } }],
        },
        select: {
          id: true,
          dealerId: true,
          name: true,
          multiplier: true,
          startTime: true,
          endTime: true,
          daysOfWeek: true,
          validFrom: true,
          validUntil: true,
          isActive: true,
          dealer: { select: { id: true, businessName: true, latitude: true, longitude: true } },
        },
        take: DISCOVERY_HAPPY_HOUR_CAP,
      });

      const seenGlobalHappyHour = new Set<string>();

      for (const hh of happyHours) {
        if (!isHappyHourLive(hh, nowTime)) continue;
        if (hh.dealerId && dealerIdsInRadius.has(hh.dealerId)) {
          const row = nearby.find((n) => n.dealerId === hh.dealerId);
          if (!row) continue;
          liveBoosts.push({
            dealerId: hh.dealerId,
            businessName: row.businessName,
            happyHourName: hh.name,
            multiplier: hh.multiplier,
            distanceKm: row.distanceKm,
            scope: 'dealer',
          });
        } else if (!hh.dealerId) {
          if (seenGlobalHappyHour.has(hh.id)) continue;
          seenGlobalHappyHour.add(hh.id);
          let best: { dealerId: string; businessName: string; distanceKm: number } | null = null;
          for (const n of nearby) {
            if (!best || n.distanceKm < best.distanceKm) {
              best = { dealerId: n.dealerId, businessName: n.businessName, distanceKm: n.distanceKm };
            }
          }
          liveBoosts.push({
            dealerId: null,
            businessName: best?.businessName || 'Yakın bölge',
            happyHourName: hh.name,
            multiplier: hh.multiplier,
            distanceKm: best?.distanceKm ?? 0,
            scope: 'global',
          });
        }
      }

      liveBoosts = liveBoosts
        .sort((a, b) => a.distanceKm - b.distanceKm || b.multiplier - a.multiplier)
        .slice(0, 12);
    }

    let favoriteDealerIds: string[] = [];
    if (session?.user?.id) {
      const favs = await prisma.customerFavoriteDealer.findMany({
        where: { userId: session.user.id },
        select: { dealerId: true },
        take: DISCOVERY_FAVORITES_CAP,
      });
      favoriteDealerIds = favs.map((f) => f.dealerId);
    }

    const res = NextResponse.json(
      {
        success: true,
        data: {
          trendingVenues,
          weeklyBest,
          sponsored,
          nearby,
          liveBoosts,
          favoriteDealerIds,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
    return res;
  } catch (error) {
    console.error('Customer discovery error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, error: 'Keşif verileri alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
