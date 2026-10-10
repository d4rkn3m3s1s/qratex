/**
 * Mekân detayı — sunucu tarafı tek yükleyici (`/customer/places/[dealerId]` sunucu bileşeni).
 *
 * Kritik veri (mekân, açık/kapalı, teklifler, ziyaret kartı, geçmişin ilk sayfası) TEK
 * turda paralel sorgularla gelir; istemci kabuk için ayrıca istek atmaz. Müşteri kapsamı:
 * her müşteri sorgusu oturumdaki `userId` ile sınırlı; mekân verisi yalnız herkese açık
 * profil alanlarıdır (iletişim e-postası/telefonu dönmez).
 *
 * Yardımcı ayarlar (keşif takvimi, inovasyon bayrağı) okunamazsa sayfa düşmez: o parça
 * boş/bilinmiyor görünür ("200 + sıfır" değil — saat "bilinmiyor", teklif listesi boş).
 */
import { prisma } from '@/lib/prisma';
import { getModuleControls } from '@/lib/module-gate';
import { getDiscoveryConfig } from '@/lib/discovery-config';
import { categoryFromBusinessCategory } from '@/lib/places/categories';
import { getInnovationPlatformConfig } from '@/lib/innovation-config';
import { EXCLUDE_LEGACY_CHURN_FLASH } from '@/lib/churn-intervention-core';
import { clampHappyHourMultiplier } from '@/lib/points-multipliers';
import { getZonedClock, isHappyHourLive, normalizeDaysOfWeek, parseHHmm } from '@/lib/happy-hour-live';
import {
  computeOpenState,
  formatMinutes,
  parseBusinessHours,
  PLACES_TIME_ZONE as VENUE_TIME_ZONE,
  type WeeklySchedule,
} from '@/lib/places/business-hours';
import { medianHours, stampCard, summarizeVisits, visitTier } from './visits';
import { getVenueHistory } from './history';
import { IMPROVEMENT_ELIGIBILITY_DAYS, listImprovementRequests } from './improvement';
import { listShareLinks } from './share';
import type { VenueDetail, VenueHappyHour, VenueOffer } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const VISIT_SCAN_CAP = 3000;
const RESPONSE_WINDOW_DAYS = 120;

/** cuid / test kimlikleri: harf-rakam, 8-64. Diğer her şey 404. */
export function isPlausibleDealerId(id: string): boolean {
  return /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

/** Haftalık programı Pazartesi'den başlayan tabloya çevirir (SAF). */
export function weekRows(week: WeeklySchedule): Array<{ day: number; ranges: Array<{ open: string; close: string }> }> {
  return [1, 2, 3, 4, 5, 6, 0].map((day) => ({
    day,
    ranges: (week[day] ?? []).map((r) => ({
      open: formatMinutes(r.open),
      close: r.close === 1440 ? '24:00' : formatMinutes(r.close),
    })),
  }));
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn('[venue-detail] yardımcı veri okunamadı:', err instanceof Error ? err.message : err);
    return fallback;
  }
}

export async function loadResponseTime(dealerId: string, now: Date) {
  const since = new Date(now.getTime() - RESPONSE_WINDOW_DAYS * DAY_MS);
  const [fb, rv] = await Promise.all([
    prisma.feedback.findMany({
      where: { qrCode: { dealerId }, deletedAt: null, dealerRepliedAt: { not: null }, createdAt: { gte: since } },
      select: { createdAt: true, dealerRepliedAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.consumptionReview.findMany({
      where: { consumption: { dealerId }, deletedAt: null, dealerRepliedAt: { not: null }, createdAt: { gte: since } },
      select: { createdAt: true, dealerRepliedAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);
  return medianHours([...fb, ...rv].map((r) => ({ createdAt: r.createdAt, repliedAt: r.dealerRepliedAt })));
}

function happyHourStartsLaterToday(
  hh: { startTime: string; daysOfWeek: unknown; isActive: boolean; validFrom: Date | null; validUntil: Date | null },
  now: Date
): boolean {
  if (!hh.isActive) return false;
  if (hh.validUntil && now > hh.validUntil) return false;
  if (hh.validFrom && hh.validFrom.getTime() - now.getTime() > DAY_MS) return false;
  const start = parseHHmm(hh.startTime);
  if (start == null) return false;
  const clock = getZonedClock(now, VENUE_TIME_ZONE);
  return normalizeDaysOfWeek(hh.daysOfWeek).includes(clock.day) && start > clock.minutes;
}

export async function getVenueDetail(input: {
  userId: string;
  dealerId: string;
  baseUrl: string;
  now?: Date;
}): Promise<VenueDetail | null> {
  const { userId, dealerId, baseUrl } = input;
  const now = input.now ?? new Date();
  if (!isPlausibleDealerId(dealerId)) return null;

  const dealer = await prisma.user.findFirst({
    where: { id: dealerId, role: 'DEALER', anonymizedAt: null, suspendedAt: null },
    select: {
      id: true,
      businessName: true,
      name: true,
      businessLogo: true,
      businessDesc: true,
      businessCategory: true,
      address: true,
      latitude: true,
      longitude: true,
      businessHours: true,
      holidayMode: true,
    },
  });
  if (!dealer) return null;

  const [
    modules,
    discovery,
    innovation,
    branches,
    favorite,
    offersRaw,
    happyRaw,
    consumptionDates,
    feedbackDates,
    responseTime,
    requests,
    shareLinks,
    history,
  ] = await Promise.all([
    safe(() => getModuleControls(), {} as Record<string, boolean>),
    safe(() => getDiscoveryConfig(), null),
    safe(() => getInnovationPlatformConfig(), null),
    prisma.dealerLocation.findMany({
      where: { dealerId, isActive: true },
      orderBy: { createdAt: 'asc' },
      take: 10,
      select: { id: true, name: true, address: true, latitude: true, longitude: true },
    }),
    prisma.customerFavoriteDealer.findUnique({
      where: { userId_dealerId: { userId, dealerId } },
      select: { id: true },
    }),
    prisma.dealerFlashOffer.findMany({
      where: { dealerId, isActive: true, validFrom: { lte: now }, validTo: { gte: now }, ...EXCLUDE_LEGACY_CHURN_FLASH },
      orderBy: { validTo: 'asc' },
      take: 6,
      select: {
        id: true,
        title: true,
        body: true,
        offerType: true,
        value: true,
        validTo: true,
        maxRedemptions: true,
        redemptionCount: true,
      },
    }),
    prisma.happyHour.findMany({
      // Puanlamadaki sorguyla aynı küme (lib/consumption/service.ts): bayi + platform geneli.
      where: { isActive: true, OR: [{ dealerId }, { dealerId: null }] },
      take: 100,
      select: {
        id: true,
        dealerId: true,
        name: true,
        multiplier: true,
        startTime: true,
        endTime: true,
        daysOfWeek: true,
        isActive: true,
        validFrom: true,
        validUntil: true,
      },
    }),
    prisma.consumption.findMany({
      where: { customerId: userId, dealerId },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: VISIT_SCAN_CAP,
    }),
    prisma.feedback.findMany({
      where: { userId, deletedAt: null, qrCode: { dealerId } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: VISIT_SCAN_CAP,
    }),
    loadResponseTime(dealerId, now),
    listImprovementRequests(userId, dealerId),
    listShareLinks(userId, dealerId, baseUrl, now),
    getVenueHistory(userId, dealerId),
  ]);

  const discoveryLocation = discovery?.locations.find((l) => l.dealerId === dealerId) ?? null;
  // Açık/kapalı: Keşfet kartlarıyla AYNI kaynak (lib/places/business-hours) — tatil > bayi saatleri > bilinmiyor.
  const schedule = parseBusinessHours(dealer.businessHours);
  const rawHours = dealer.businessHours?.trim() ? dealer.businessHours.trim().slice(0, 500) : null;

  const flashEnabled = innovation ? innovation.features.flashOffers !== false : true;
  const offers: VenueOffer[] = flashEnabled
    ? offersRaw
        .filter((o) => o.redemptionCount < o.maxRedemptions)
        .slice(0, 4)
        .map((o) => ({
          id: o.id,
          title: o.title,
          body: o.body,
          offerType: o.offerType,
          value: o.value,
          validTo: o.validTo.toISOString(),
        }))
    : [];

  const happyHours: VenueHappyHour[] = happyRaw
    .map((hh) => {
      const live = isHappyHourLive(hh, now, VENUE_TIME_ZONE);
      const later = !live && happyHourStartsLaterToday(hh, now);
      if (!live && !later) return null;
      return {
        id: hh.id,
        name: hh.name,
        multiplier: clampHappyHourMultiplier(hh.multiplier),
        startTime: hh.startTime,
        endTime: hh.endTime,
        live,
        global: hh.dealerId == null,
      };
    })
    .filter((x): x is VenueHappyHour => x !== null)
    .sort((a, b) => Number(b.live) - Number(a.live) || b.multiplier - a.multiplier)
    .slice(0, 3);

  const visits = summarizeVisits([...consumptionDates, ...feedbackDates].map((r) => r.createdAt));
  const eligible = Boolean(
    visits.lastVisitAt && now.getTime() - visits.lastVisitAt.getTime() <= IMPROVEMENT_ELIGIBILITY_DAYS * DAY_MS
  );
  const experiencesEnabled = modules.experiences !== false;

  return {
    dealer: {
      id: dealer.id,
      name: dealer.businessName?.trim() || dealer.name?.trim() || 'İşletme',
      logo: dealer.businessLogo,
      description: dealer.businessDesc?.trim() || null,
      category: categoryFromBusinessCategory(dealer.businessCategory),
      address: dealer.address?.trim() || discoveryLocation?.address?.trim() || null,
      latitude: dealer.latitude ?? (discoveryLocation && discoveryLocation.latitude ? discoveryLocation.latitude : null),
      longitude: dealer.longitude ?? (discoveryLocation && discoveryLocation.longitude ? discoveryLocation.longitude : null),
    },
    branches: branches.map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address?.trim() || null,
      latitude: b.latitude,
      longitude: b.longitude,
    })),
    hours: {
      state: computeOpenState(schedule, dealer.holidayMode === true, now, VENUE_TIME_ZONE),
      rows: schedule ? weekRows(schedule) : null,
      raw: rawHours && !rawHours.startsWith('{') ? rawHours : null,
    },
    offers,
    happyHours,
    isFavorite: Boolean(favorite),
    visits: {
      days: visits.days,
      firstVisitAt: visits.firstVisitAt?.toISOString() ?? null,
      lastVisitAt: visits.lastVisitAt?.toISOString() ?? null,
      stamps: stampCard(visits.days),
      tier: visitTier(visits.days),
    },
    responseTime,
    improvement: { enabled: experiencesEnabled, eligible, requests },
    share: { enabled: experiencesEnabled, links: shareLinks },
    history,
    generatedAt: now.toISOString(),
  };
}
