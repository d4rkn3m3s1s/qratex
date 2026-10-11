/**
 * Keşif hesabı — müşteri ucu (`/api/customer/discovery`) ve admin önizlemesi
 * (`/api/admin/discovery/preview`) AYNI fonksiyonu kullanır (rapor Bulgu 10).
 *
 * Düzeltmeler (docs/audit/2026-10-08/admin/admin_discovery.md):
 *  - Bulgu 4: "Açık/Kapalı" artık Europe/Istanbul duvar saatiyle (`lib/places/business-hours`)
 *    hesaplanır; sunucu UTC'si kaydırmaz.
 *  - Bulgu 3: çalışma saati önce BAYİ PROFİLİNDEN (`User.businessHours` + `holidayMode`), yoksa
 *    keşif ayarındaki yedek saatten okunur; ikisi de yoksa `isOpenNow: null` ("bilinmiyor") —
 *    09–23 "açık" varsayımı kaldırıldı. Konum da önce profilden, yoksa yedek satırdan.
 *  - #30: kategori karşılaştırması Türkçe küçük harfle (`TATLI` → `tatlı`, `tatli` değil).
 *  - Bulgu 10: ağır sinyal taraması (30 gün geri bildirim + 7 gün değerlendirme) 120 sn Redis
 *    önbelleğinde; önizleme her tıklamada tabloyu yeniden taramaz.
 */
import type { prisma as prismaClient } from '@/lib/prisma';
import type { DiscoveryConfig } from '@/lib/discovery-config';
import { isHappyHourLive } from '@/lib/happy-hour-live';
import { computeOpenState, parseBusinessHours, type WeeklySchedule } from '@/lib/places/business-hours';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import type { DiscoveryComputed, NearbyItem, Sponsored } from '@/lib/admin-discovery/contract';

type Db = typeof prismaClient;

const NEARBY_DEALER_CAP = 2_000;
const HAPPY_HOUR_CAP = 200;
const SIGNALS_TTL_S = 120;
const SIGNALS_KEY = 'discovery:signals:v3';
const EARTH_RADIUS_KM = 6371;

const rad = (v: number) => (v * Math.PI) / 180;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeCategoryLabel(value: string): string {
  const text = value.toLocaleLowerCase('tr-TR').trim();
  if (text.includes('kahve') || text.includes('coffee')) return 'kahve';
  if (text.includes('tatlı') || text.includes('tatli') || text.includes('dessert')) return 'tatlı';
  if (text.includes('yemek') || text.includes('food') || text.includes('restoran') || text.includes('restaurant')) return 'yemek';
  return text;
}

function toMinutes(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Yedek satırın saatini haftalık programa çevirir; eksikse null (bilinmiyor). */
export function scheduleFromFallback(row: { opensAt?: string; closesAt?: string; daysOfWeek?: number[] } | undefined): WeeklySchedule | null {
  if (!row) return null;
  const open = toMinutes(row.opensAt);
  const close = toMinutes(row.closesAt);
  if (open === null || close === null) return null;
  const days = row.daysOfWeek && row.daysOfWeek.length > 0 ? row.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  const schedule: WeeklySchedule = [[], [], [], [], [], [], []];
  const range = open === close ? { open: 0, close: 1440 } : { open, close };
  for (const d of days) if (d >= 0 && d <= 6) schedule[d].push(range);
  return schedule;
}

/** Açık mı + kaynağı. Profil saati (ya da tatil modu) önceliklidir. */
export function resolveOpenNow(
  profile: { businessHours: string | null; holidayMode: boolean },
  fallback: { opensAt?: string; closesAt?: string; daysOfWeek?: number[] } | undefined,
  now: Date
): { isOpenNow: boolean | null; source: 'profile' | 'fallback' | null; holiday: boolean } {
  if (profile.holidayMode) return { isOpenNow: false, source: 'profile', holiday: true };
  const fromProfile = parseBusinessHours(profile.businessHours);
  if (fromProfile) {
    const st = computeOpenState(fromProfile, false, now);
    return { isOpenNow: st ? st.status === 'open' : null, source: 'profile', holiday: false };
  }
  const fromFallback = scheduleFromFallback(fallback);
  if (fromFallback) {
    const st = computeOpenState(fromFallback, false, now);
    return { isOpenNow: st ? st.status === 'open' : null, source: 'fallback', holiday: false };
  }
  return { isOpenNow: null, source: null, holiday: false };
}

/** Yayındaki sponsorlu duyurular (aktif + tarih penceresi; geçersiz tarih → yayında değil). */
export function liveSponsored(list: ReadonlyArray<Sponsored | DiscoveryConfig['sponsored'][number]>, now: Date, limit = 10): Sponsored[] {
  const t = now.getTime();
  return list
    .filter((item) => {
      if (!item.isActive) return false;
      if (item.startsAt) {
        const s = Date.parse(item.startsAt);
        if (Number.isNaN(s) || s > t) return false;
      }
      if (item.endsAt) {
        const e = Date.parse(item.endsAt);
        if (Number.isNaN(e) || e <= t) return false;
      }
      return true;
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit) as Sponsored[];
}

type Signals = {
  trendingVenues: DiscoveryComputed['trendingVenues'];
  weekly: Record<'ambience' | 'food' | 'service', { dealerId: string; businessName: string; score: number } | null>;
};

type VenueAggRow = { dealerId: string; n: unknown; ratingSum: unknown; scans: unknown };
type DimAggRow = { dealerId: string; ambience: unknown; food: unknown; service: unknown };

const num = (v: unknown): number => (typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v ?? 0) || 0);

/**
 * Global keşif sinyalleri (perf Y4): eskiden son 30 günün 25.000'e kadar geri bildirimi ve 7 günün
 * 20.000'e kadar değerlendirmesi belleğe çekilip JS'te gruplanıyordu (tavan dolunca sessizce
 * eksik sayım; dizi kopyalayan `push` ile kuadratik bellek). Artık iki `GROUP BY` sorgusu yalnız
 * işletme başına özet döndürür; tavan yok, satır taşınmaz. Puan formülü ve kazanan seçimi aynı.
 */
async function loadSignals(db: Db, now: Date): Promise<Signals> {
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [venueRows, dimRows] = await Promise.all([
    db.$queryRaw<VenueAggRow[]>`
      SELECT q."dealerId" AS "dealerId",
             COUNT(*)::int AS n,
             COALESCE(SUM(f."rating"), 0)::int AS "ratingSum",
             COALESCE(MAX(q."scanCount"), 0)::int AS scans
      FROM "Feedback" f
      JOIN "QRCode" q ON q."id" = f."qrCodeId"
      WHERE f."deletedAt" IS NULL AND f."createdAt" >= ${thirtyDaysAgo}
      GROUP BY q."dealerId"`,
    // Boyut puanı yoksa (ya da sayı değilse) genel puan kullanılır — eski JS kuralıyla aynı.
    db.$queryRaw<DimAggRow[]>`
      SELECT c."dealerId" AS "dealerId",
             AVG(CASE WHEN jsonb_typeof(r."dimensions"->'ambience') = 'number' THEN (r."dimensions"->>'ambience')::float8 ELSE COALESCE(r."rating", 0) END) AS ambience,
             AVG(CASE WHEN jsonb_typeof(r."dimensions"->'taste') = 'number' THEN (r."dimensions"->>'taste')::float8 ELSE COALESCE(r."rating", 0) END) AS food,
             AVG(CASE WHEN jsonb_typeof(r."dimensions"->'service') = 'number' THEN (r."dimensions"->>'service')::float8 ELSE COALESCE(r."rating", 0) END) AS service
      FROM "ConsumptionReview" r
      JOIN "Consumption" c ON c."id" = r."consumptionId"
      WHERE r."deletedAt" IS NULL AND r."createdAt" >= ${sevenDaysAgo}
      GROUP BY c."dealerId"
      ORDER BY c."dealerId"`,
  ]);

  const scored = venueRows
    .map((r) => {
      const n = num(r.n);
      const avg = n > 0 ? num(r.ratingSum) / n : 0;
      const scans = num(r.scans);
      return {
        dealerId: r.dealerId,
        feedbackCount: n,
        avgRating: Number(avg.toFixed(2)),
        score: Math.round(avg * 20 + Math.min(30, n * 1.5) + Math.min(20, scans / 10)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  type Winner = { dealerId: string; businessName: string; score: number } | null;
  const best = (pick: (r: DimAggRow) => unknown): Winner => {
    let winner: Winner = null;
    for (const r of dimRows) {
      const score = Number(num(pick(r)).toFixed(2));
      if (!winner || score > winner.score) winner = { dealerId: r.dealerId, businessName: 'İşletme', score };
    }
    return winner;
  };
  const weekly = { ambience: best((r) => r.ambience), food: best((r) => r.food), service: best((r) => r.service) };

  // Ad/görsel yalnız gösterilecek işletmeler için (en çok 8 + 3).
  const ids = [
    ...new Set([...scored.map((v) => v.dealerId), ...Object.values(weekly).flatMap((w) => (w ? [w.dealerId] : []))]),
  ];
  const dealers = ids.length
    ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, businessName: true, image: true } })
    : [];
  const dealerMap = new Map(dealers.map((d) => [d.id, d]));

  const trendingVenues = scored.map((v) => {
    const d = dealerMap.get(v.dealerId);
    return { dealerId: v.dealerId, businessName: d?.businessName || 'İşletme', image: d?.image ?? null, feedbackCount: v.feedbackCount, avgRating: v.avgRating, score: v.score };
  });
  for (const w of Object.values(weekly)) if (w) w.businessName = dealerMap.get(w.dealerId)?.businessName || 'İşletme';

  return { trendingVenues, weekly };
}

async function getSignals(db: Db, now: Date): Promise<Signals> {
  const cached = await redisGetJson<Signals>(SIGNALS_KEY);
  if (cached && Array.isArray(cached.trendingVenues) && cached.weekly) return cached;
  const fresh = await loadSignals(db, now);
  await redisSetJson(SIGNALS_KEY, fresh, SIGNALS_TTL_S);
  return fresh;
}

export type ComputeOptions = {
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number;
  category?: string;
  now?: Date;
};

export async function computeDiscovery(db: Db, config: DiscoveryConfig, opts: ComputeOptions = {}): Promise<DiscoveryComputed> {
  const now = opts.now ?? new Date();
  const radiusKm = Math.min(50, Math.max(0.1, opts.radiusKm ?? 5));
  const category = (opts.category || 'all').toLocaleLowerCase('tr-TR');
  const signals = await getSignals(db, now);

  const weeklyBest: DiscoveryComputed['weeklyBest'] = [
    { key: 'ambience', label: config.weeklyHighlights.ambienceLabel, winner: signals.weekly.ambience },
    { key: 'food', label: config.weeklyHighlights.foodLabel, winner: signals.weekly.food },
    { key: 'service', label: config.weeklyHighlights.serviceLabel, winner: signals.weekly.service },
  ];
  const sponsored = liveSponsored(config.sponsored, now);

  const lat = opts.lat;
  const lng = opts.lng;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { trendingVenues: signals.trendingVenues, weeklyBest, sponsored, nearby: [], nearbyTotal: 0, liveBoosts: [] };
  }

  const fallbackById = new Map(config.locations.map((l) => [l.dealerId, l]));
  const fallbackIds = [...fallbackById.keys()];
  const pad = Math.max(0.05, (radiusKm / 111) * 1.35);
  const cosLat = Math.cos(rad(lat));
  const padLng = Math.abs(cosLat) > 0.02 ? Math.max(0.05, pad / cosLat) : 180;

  const dealers = await db.user.findMany({
    where: {
      role: 'DEALER',
      OR: [
        { latitude: { gte: lat - pad, lte: lat + pad }, longitude: { gte: lng - padLng, lte: lng + padLng } },
        ...(fallbackIds.length ? [{ id: { in: fallbackIds }, latitude: null }] : []),
      ],
    },
    select: { id: true, businessName: true, address: true, latitude: true, longitude: true, businessHours: true, holidayMode: true },
    take: NEARBY_DEALER_CAP,
  });

  const scope = dealers.map((d) => d.id);
  const productCategories = scope.length
    ? await db.productCategory.findMany({ where: { dealerId: { in: scope }, isActive: true }, select: { dealerId: true, name: true }, take: 8_000 })
    : [];
  const catsById = new Map<string, Set<string>>();
  for (const l of config.locations) catsById.set(l.dealerId, new Set(l.categories.map(normalizeCategoryLabel)));
  for (const pc of productCategories) {
    if (!pc.dealerId) continue;
    const n = normalizeCategoryLabel(pc.name);
    if (!n) continue;
    const set = catsById.get(pc.dealerId) ?? new Set<string>();
    set.add(n);
    catsById.set(pc.dealerId, set);
  }
  const scoreById = new Map(signals.trendingVenues.map((v) => [v.dealerId, v]));

  const all: NearbyItem[] = [];
  for (const d of dealers) {
    const fb = fallbackById.get(d.id);
    const fromProfile = d.latitude != null && d.longitude != null;
    const la = fromProfile ? (d.latitude as number) : fb?.latitude;
    const lo = fromProfile ? (d.longitude as number) : fb?.longitude;
    if (la == null || lo == null) continue;
    const distanceKm = haversineKm(lat, lng, la, lo);
    if (distanceKm > radiusKm) continue;
    const cats = [...(catsById.get(d.id) ?? [])];
    if (category !== 'all' && !cats.includes(normalizeCategoryLabel(category))) continue;
    const open = resolveOpenNow({ businessHours: d.businessHours, holidayMode: d.holidayMode }, fb, now);
    const sc = scoreById.get(d.id);
    all.push({
      dealerId: d.id,
      businessName: d.businessName || 'İşletme',
      address: d.address?.trim() || fb?.address || undefined,
      latitude: la,
      longitude: lo,
      distanceKm: Number(distanceKm.toFixed(2)),
      categories: cats,
      avgRating: sc?.avgRating ?? 0,
      trendScore: sc?.score ?? 0,
      feedbackCount: sc?.feedbackCount ?? 0,
      isOpenNow: open.isOpenNow,
      openSource: open.source,
      locationSource: fromProfile ? 'profile' : 'fallback',
      holiday: open.holiday,
    });
  }
  all.sort((a, b) => a.distanceKm - b.distanceKm);
  const nearby = all.slice(0, 20);

  const inRadius = new Set(nearby.map((n) => n.dealerId));
  const happyHours = await db.happyHour.findMany({
    where: { isActive: true, OR: [{ dealerId: null }, { dealerId: { in: [...inRadius] } }] },
    select: { id: true, dealerId: true, name: true, multiplier: true, startTime: true, endTime: true, daysOfWeek: true, validFrom: true, validUntil: true, isActive: true },
    take: HAPPY_HOUR_CAP,
  });
  const liveBoosts: DiscoveryComputed['liveBoosts'] = [];
  const closest = nearby[0] ?? null;
  for (const hh of happyHours) {
    if (!isHappyHourLive(hh, now)) continue;
    if (hh.dealerId) {
      const row = nearby.find((n) => n.dealerId === hh.dealerId);
      if (row) liveBoosts.push({ dealerId: hh.dealerId, businessName: row.businessName, happyHourName: hh.name, multiplier: hh.multiplier, distanceKm: row.distanceKm, scope: 'dealer' });
    } else {
      liveBoosts.push({
        dealerId: null,
        businessName: closest?.businessName || 'Yakın bölge',
        happyHourName: hh.name,
        multiplier: hh.multiplier,
        distanceKm: closest?.distanceKm ?? 0,
        scope: 'global',
      });
    }
  }
  liveBoosts.sort((a, b) => a.distanceKm - b.distanceKm || b.multiplier - a.multiplier);

  return { trendingVenues: signals.trendingVenues, weeklyBest, sponsored, nearby, nearbyTotal: all.length, liveBoosts: liveBoosts.slice(0, 12) };
}
