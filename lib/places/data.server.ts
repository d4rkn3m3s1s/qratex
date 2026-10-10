/**
 * Keşfet (/customer/places) — sunucu veri katmanı. Sayfa (sunucu bileşeni) ve BFF uçları
 * AYNI fonksiyonları çağırır: ilk render sunucuda, sonraki istekler `/api/customer/places/*`.
 *
 * İlkeler:
 *  - Vitrine yalnız "herkese açık" işletmeler çıkar: DEALER, demo değil, askıda/anonim değil,
 *    işletme adı dolu (bayinin kişisel adı müşteriye ASLA gösterilmez).
 *  - Puan = güvenilir oy: kişi başı tek (son) oy; anonim, güven/fraud/toksik işaretli,
 *    gölge-ban'lı ve demo yazarlar sayılmaz; QR geri bildirimi + kartlı tüketim yorumu birlikte.
 *    Eski keşif ucunun "yalnız platform ilk 8'ine puan" hatası yapısal olarak yok: puan,
 *    ekrandaki mekân kümesi için hesaplanır.
 *  - Açık/kapalı: bayinin kendi saatleri + tatil modu, İstanbul saatiyle (business-hours.ts).
 *  - Mutlu saat canlılığı puanlamayla aynı fonksiyon (lib/happy-hour-live#isHappyHourLive);
 *    platform geneli mutlu saat bir mekâna ATFEDİLMEZ (`globalBoost` ayrı alan).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isHappyHourLive } from '@/lib/happy-hour-live';
import { clampHappyHourMultiplier } from '@/lib/points-multipliers';
import { EXCLUDE_LEGACY_CHURN_FLASH } from '@/lib/churn-intervention-core';
import { cachedJson } from '@/lib/redis';
import { getBusinessOfMonth } from '@/lib/business-of-month';
import { computeOpenState, parseBusinessHours } from './business-hours';
import { categorizeDealer, type PlaceCategory, PLACE_CATEGORY_SLUGS } from './categories';
import { boundingBox, distanceKm, isValidLatLng } from './geo';
import { currentOrNextWindow, parseOffer } from './happy-hour-schedule';
import { BAYES_PRIOR_WEIGHT, RANKING_MIN_REVIEWERS, bayesScore, displayRating, priorMean, rankDealers, type RatingAggregate } from './ranking';
import type {
  FlashOfferDto,
  HappyHourDto,
  LiveBoostDto,
  NearbyResponse,
  SavedResponse,
  SavedVenueDto,
  TopEntryDto,
  TopResponse,
  VenueSummaryDto,
} from './types';

export type PlacesDb = typeof prisma;

export const SAVED_LIMIT = 200;
export const NEARBY_PAGE_SIZE = 20;
const CANDIDATE_CAP = 1000;
const RATING_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_LIMIT = 50;
const TOP_CACHE_TTL_S = 600;

/** Herkese açık işletme filtresi (müşteri vitrini). */
export const PUBLIC_DEALER_WHERE: Prisma.UserWhereInput = {
  role: 'DEALER',
  isDemo: false,
  suspendedAt: null,
  anonymizedAt: null,
  AND: [{ businessName: { not: null } }, { businessName: { not: '' } }],
};

const DEALER_SELECT = {
  id: true,
  businessName: true,
  image: true,
  businessLogo: true,
  address: true,
  latitude: true,
  longitude: true,
  businessHours: true,
  holidayMode: true,
  businessCategory: true,
} satisfies Prisma.UserSelect;

type DealerRow = Prisma.UserGetPayload<{ select: typeof DEALER_SELECT }>;

function dealerImage(row: { businessLogo: string | null; image: string | null }): string | null {
  const v = row.businessLogo || row.image;
  return v && /^(https?:\/\/|\/)/.test(v) ? v : null;
}

// ───────────────────────────── Toplu okuma yardımcıları ─────────────────────────────

/** Aktif ürün kategorisi adları (kategori türetimi için). */
async function loadProductCategoryNames(db: PlacesDb, dealerIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (dealerIds.length === 0) return out;
  const rows = await db.productCategory.findMany({
    where: { dealerId: { in: dealerIds }, isActive: true },
    select: { dealerId: true, name: true },
    take: 20_000,
  });
  for (const r of rows) {
    if (!r.dealerId) continue;
    const list = out.get(r.dealerId) ?? [];
    list.push(r.name);
    out.set(r.dealerId, list);
  }
  return out;
}

/**
 * Güvenilir oy toplamları (kişi başı son oy). `dealerIds` verilmezse tüm herkese açık
 * işletmeler (En iyiler). Tek SQL: Feedback ∪ ConsumptionReview.
 */
export async function loadTrustedRatings(
  db: PlacesDb,
  opts: { dealerIds?: string[]; since: Date },
): Promise<Map<string, RatingAggregate>> {
  const out = new Map<string, RatingAggregate>();
  if (opts.dealerIds && opts.dealerIds.length === 0) return out;
  const fbFilter = opts.dealerIds ? Prisma.sql`AND q."dealerId" = ANY(${opts.dealerIds})` : Prisma.empty;
  const crFilter = opts.dealerIds ? Prisma.sql`AND c."dealerId" = ANY(${opts.dealerIds})` : Prisma.empty;
  const rows = await db.$queryRaw<Array<{ dealerId: string; n: number; avg: number }>>(Prisma.sql`
    WITH votes AS (
      SELECT q."dealerId" AS dealer_id, f."userId" AS user_id, f."rating" AS rating, f."createdAt" AS at
      FROM "Feedback" f
      JOIN "QRCode" q ON q."id" = f."qrCodeId"
      JOIN "User" a ON a."id" = f."userId"
      WHERE f."deletedAt" IS NULL AND f."createdAt" >= ${opts.since}
        AND f."userId" IS NOT NULL AND f."trustFlagged" = false AND f."isToxic" = false
        AND COALESCE(f."fraudScore", 0) < 0.7
        AND a."role" = 'CUSTOMER' AND a."fraudStatus" <> 'shadow_ban' AND a."isDemo" = false
        ${fbFilter}
      UNION ALL
      SELECT c."dealerId" AS dealer_id, r."customerId" AS user_id, r."rating" AS rating, r."createdAt" AS at
      FROM "ConsumptionReview" r
      JOIN "Consumption" c ON c."id" = r."consumptionId"
      JOIN "User" a ON a."id" = r."customerId"
      WHERE r."deletedAt" IS NULL AND r."createdAt" >= ${opts.since}
        AND a."role" = 'CUSTOMER' AND a."fraudStatus" <> 'shadow_ban' AND a."isDemo" = false
        ${crFilter}
    ),
    latest AS (
      SELECT DISTINCT ON (dealer_id, user_id) dealer_id, rating
      FROM votes
      ORDER BY dealer_id, user_id, at DESC
    )
    SELECT dealer_id AS "dealerId", COUNT(*)::int AS n, AVG(rating)::float AS avg
    FROM latest
    GROUP BY dealer_id
  `);
  for (const r of rows) {
    const n = Number(r.n);
    const avg = Number(r.avg);
    if (n > 0 && Number.isFinite(avg)) out.set(r.dealerId, { dealerId: r.dealerId, n, avg });
  }
  return out;
}

/** Kullanıcının mekân başına ziyaretleri (kartlı harcama + QR geri bildirim). */
export async function loadMyVisits(
  db: PlacesDb,
  userId: string,
  opts: { dealerIds?: string[]; limit?: number } = {},
): Promise<Array<{ dealerId: string; visits: number; lastAt: Date }>> {
  if (opts.dealerIds && opts.dealerIds.length === 0) return [];
  const cFilter = opts.dealerIds ? Prisma.sql`AND c."dealerId" = ANY(${opts.dealerIds})` : Prisma.empty;
  const fFilter = opts.dealerIds ? Prisma.sql`AND q."dealerId" = ANY(${opts.dealerIds})` : Prisma.empty;
  const limit = Math.max(1, Math.min(opts.limit ?? 500, 1000));
  const rows = await db.$queryRaw<Array<{ dealerId: string; visits: number; lastAt: Date }>>(Prisma.sql`
    SELECT dealer_id AS "dealerId", COUNT(*)::int AS visits, MAX(at) AS "lastAt"
    FROM (
      SELECT c."dealerId" AS dealer_id, c."createdAt" AS at
      FROM "Consumption" c
      WHERE c."customerId" = ${userId} ${cFilter}
      UNION ALL
      SELECT q."dealerId" AS dealer_id, f."createdAt" AS at
      FROM "Feedback" f JOIN "QRCode" q ON q."id" = f."qrCodeId"
      WHERE f."userId" = ${userId} AND f."deletedAt" IS NULL ${fFilter}
    ) v
    GROUP BY dealer_id
    ORDER BY "lastAt" DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({ dealerId: r.dealerId, visits: Number(r.visits), lastAt: new Date(r.lastAt) }));
}

const HAPPY_HOUR_SELECT = {
  id: true,
  dealerId: true,
  name: true,
  description: true,
  multiplier: true,
  startTime: true,
  endTime: true,
  daysOfWeek: true,
  isActive: true,
  validFrom: true,
  validUntil: true,
  dealer: { select: { id: true, businessName: true, image: true, businessLogo: true, latitude: true, longitude: true, isDemo: true, suspendedAt: true } },
} satisfies Prisma.HappyHourSelect;

type HappyHourRow = Prisma.HappyHourGetPayload<{ select: typeof HAPPY_HOUR_SELECT }>;

/** Aktif (geçerlilik penceresinde) mutlu saatler. `dealerIds` verilirse bunlar + platform geneli. */
export async function loadHappyHours(db: PlacesDb, now: Date, dealerIds?: string[]): Promise<HappyHourRow[]> {
  const scope: Prisma.HappyHourWhereInput = dealerIds
    ? { OR: [{ dealerId: null }, { dealerId: { in: dealerIds } }] }
    : { OR: [{ dealerId: null }, { dealer: { isDemo: false, suspendedAt: null } }] };
  const rows = await db.happyHour.findMany({
    where: {
      isActive: true,
      AND: [scope, { OR: [{ validUntil: null }, { validUntil: { gte: now } }] }],
    },
    select: HAPPY_HOUR_SELECT,
    orderBy: { createdAt: 'desc' },
    take: 400,
  });
  return rows.filter((r) => !r.dealer || (!r.dealer.isDemo && !r.dealer.suspendedAt));
}

export function toHappyHourDto(row: HappyHourRow, origin: { lat: number; lng: number } | null): HappyHourDto {
  const days = Array.isArray(row.daysOfWeek) ? (row.daysOfWeek as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [];
  const d = row.dealer;
  const dist = origin && d && d.latitude != null && d.longitude != null ? distanceKm(origin.lat, origin.lng, d.latitude, d.longitude) : null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    multiplier: clampHappyHourMultiplier(row.multiplier),
    startTime: row.startTime,
    endTime: row.endTime,
    daysOfWeek: days,
    validFrom: row.validFrom ? row.validFrom.toISOString() : null,
    validUntil: row.validUntil ? row.validUntil.toISOString() : null,
    isActive: row.isActive,
    dealer: d ? { id: d.id, businessName: d.businessName, image: dealerImage(d) } : null,
    dealerId: row.dealerId,
    distanceKm: dist === null ? null : Math.round(dist * 10) / 10,
  };
}

/** Canlı mutlu saatlerden mekân başına en iyi + platform geneli en iyi. */
export function liveBoosts(rows: readonly HappyHourRow[], now: Date): { byDealer: Map<string, LiveBoostDto>; global: LiveBoostDto | null } {
  const byDealer = new Map<string, LiveBoostDto>();
  let global: LiveBoostDto | null = null;
  for (const row of rows) {
    if (!isHappyHourLive(row, now)) continue;
    const multiplier = clampHappyHourMultiplier(row.multiplier);
    if (multiplier <= 1) continue;
    const offer = parseOffer({ ...row, dealer: null });
    const window = offer ? currentOrNextWindow(offer, now) : null;
    const dto: LiveBoostDto = {
      happyHourId: row.id,
      name: row.name,
      multiplier,
      endsAt: window ? window.end.toISOString() : null,
      scope: row.dealerId ? 'dealer' : 'global',
    };
    if (!row.dealerId) {
      if (!global || dto.multiplier > global.multiplier) global = dto;
      continue;
    }
    const prev = byDealer.get(row.dealerId);
    if (!prev || dto.multiplier > prev.multiplier) byDealer.set(row.dealerId, dto);
  }
  return { byDealer, global };
}

const FLASH_SELECT = {
  id: true,
  title: true,
  body: true,
  offerType: true,
  value: true,
  validTo: true,
  maxRedemptions: true,
  redemptionCount: true,
  dealer: { select: { id: true, businessName: true, latitude: true, longitude: true, isDemo: true, suspendedAt: true } },
} satisfies Prisma.DealerFlashOfferSelect;

/**
 * Şu an geçerli kısa süreli teklifler. Eski kişiye-özel churn taslakları (P0-22) ve demo/askıdaki
 * işletmelerin teklifleri herkese açık listeye girmez; dolmuş kontenjan elenir.
 */
export async function loadFlashOffers(
  db: PlacesDb,
  now: Date,
  opts: { dealerIds?: string[]; origin?: { lat: number; lng: number } | null; radiusKm?: number } = {},
): Promise<FlashOfferDto[]> {
  if (opts.dealerIds && opts.dealerIds.length === 0 && !opts.origin) return [];
  const rows = await db.dealerFlashOffer.findMany({
    where: {
      isActive: true,
      validFrom: { lte: now },
      validTo: { gte: now },
      ...EXCLUDE_LEGACY_CHURN_FLASH,
      ...(opts.dealerIds && !opts.origin ? { dealerId: { in: opts.dealerIds } } : {}),
    },
    select: FLASH_SELECT,
    orderBy: { validTo: 'asc' },
    take: 300,
  });
  const out: FlashOfferDto[] = [];
  const allowed = opts.dealerIds ? new Set(opts.dealerIds) : null;
  for (const r of rows) {
    if (r.redemptionCount >= r.maxRedemptions) continue;
    if (r.dealer.isDemo || r.dealer.suspendedAt || !r.dealer.businessName) continue;
    let dist: number | null = null;
    if (opts.origin && r.dealer.latitude != null && r.dealer.longitude != null) {
      dist = distanceKm(opts.origin.lat, opts.origin.lng, r.dealer.latitude, r.dealer.longitude);
    }
    const inRadius = opts.origin ? dist !== null && dist <= (opts.radiusKm ?? 15) : false;
    const inSet = allowed ? allowed.has(r.dealer.id) : false;
    if (opts.origin || allowed) {
      if (!inRadius && !inSet) continue;
    }
    out.push({
      id: r.id,
      title: r.title,
      body: r.body,
      offerType: r.offerType,
      value: r.value ?? null,
      validTo: r.validTo.toISOString(),
      dealerId: r.dealer.id,
      venueName: r.dealer.businessName,
      distanceKm: dist === null ? null : Math.round(dist * 10) / 10,
    });
  }
  return out.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.validTo.localeCompare(b.validTo)).slice(0, 50);
}

async function loadSavedSet(db: PlacesDb, userId: string, dealerIds: string[]): Promise<Map<string, Date>> {
  if (dealerIds.length === 0) return new Map();
  const rows = await db.customerFavoriteDealer.findMany({
    where: { userId, dealerId: { in: dealerIds } },
    select: { dealerId: true, createdAt: true },
  });
  return new Map(rows.map((r) => [r.dealerId, r.createdAt]));
}

// ───────────────────────────── Özet kart üretimi ─────────────────────────────

interface BaseVenue {
  row: DealerRow;
  categories: PlaceCategory[];
  distanceKm: number | null;
}

async function buildSummaries(
  db: PlacesDb,
  userId: string,
  bases: BaseVenue[],
  now: Date,
  pre?: { ratings?: Map<string, RatingAggregate>; boosts?: Map<string, LiveBoostDto> },
): Promise<VenueSummaryDto[]> {
  const ids = bases.map((b) => b.row.id);
  if (ids.length === 0) return [];
  const since = new Date(now.getTime() - RATING_WINDOW_DAYS * DAY_MS);
  const [ratings, boosts, flash, saved, visits] = await Promise.all([
    pre?.ratings ?? loadTrustedRatings(db, { dealerIds: ids, since }),
    pre?.boosts ?? loadHappyHours(db, now, ids).then((rows) => liveBoosts(rows, now).byDealer),
    loadFlashOffers(db, now, { dealerIds: ids }),
    loadSavedSet(db, userId, ids),
    loadMyVisits(db, userId, { dealerIds: ids }),
  ]);
  const flashCount = new Map<string, number>();
  for (const f of flash) flashCount.set(f.dealerId, (flashCount.get(f.dealerId) ?? 0) + 1);
  const visitMap = new Map(visits.map((v) => [v.dealerId, v]));
  return bases.map(({ row, categories, distanceKm: dist }) => {
    const v = visitMap.get(row.id);
    return {
      dealerId: row.id,
      name: row.businessName as string,
      image: dealerImage(row),
      address: row.address ?? null,
      categories,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      distanceKm: dist === null ? null : Math.round(dist * 100) / 100,
      openState: computeOpenState(parseBusinessHours(row.businessHours), row.holidayMode, now),
      rating: displayRating(ratings.get(row.id)),
      liveBoost: boosts.get(row.id) ?? null,
      flashCount: flashCount.get(row.id) ?? 0,
      isSaved: saved.has(row.id),
      myVisits: v?.visits ?? 0,
      myLastVisitAt: v ? v.lastAt.toISOString() : null,
    };
  });
}

// ───────────────────────────── Yakınımda ─────────────────────────────

export interface NearbyQuery {
  lat?: number | null;
  lng?: number | null;
  radiusKm: number;
  category?: PlaceCategory | null;
  q?: string | null;
  openNow?: boolean;
  boost?: boolean;
  sort?: 'distance' | 'rating';
  offset?: number;
  limit?: number;
}

export async function getNearbyPlaces(
  userId: string,
  query: NearbyQuery,
  now: Date = new Date(),
  db: PlacesDb = prisma,
): Promise<NearbyResponse> {
  const located = isValidLatLng(query.lat, query.lng);
  const origin = located ? { lat: query.lat as number, lng: query.lng as number } : null;
  const limit = Math.max(1, Math.min(query.limit ?? NEARBY_PAGE_SIZE, 50));
  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const q = query.q?.trim().slice(0, 60) || null;

  const where: Prisma.UserWhereInput = { ...PUBLIC_DEALER_WHERE };
  const and: Prisma.UserWhereInput[] = [...((PUBLIC_DEALER_WHERE.AND as Prisma.UserWhereInput[]) ?? [])];
  if (origin) {
    const box = boundingBox(origin.lat, origin.lng, query.radiusKm);
    and.push({ latitude: { gte: box.minLat, lte: box.maxLat } }, { longitude: { gte: box.minLng, lte: box.maxLng } });
  }
  if (q) and.push({ businessName: { contains: q, mode: 'insensitive' } });
  where.AND = and;

  const rows = await db.user.findMany({
    where,
    select: DEALER_SELECT,
    orderBy: { createdAt: 'desc' },
    take: CANDIDATE_CAP,
  });

  let bases: BaseVenue[] = rows.map((row) => ({
    row,
    categories: [],
    distanceKm:
      origin && row.latitude != null && row.longitude != null
        ? distanceKm(origin.lat, origin.lng, row.latitude, row.longitude)
        : null,
  }));
  if (origin) bases = bases.filter((b) => b.distanceKm !== null && b.distanceKm <= query.radiusKm);

  const names = await loadProductCategoryNames(db, bases.map((b) => b.row.id));
  for (const b of bases) {
    b.categories = categorizeDealer({ businessCategory: b.row.businessCategory, productCategoryNames: names.get(b.row.id) ?? [] });
  }
  const present = new Set<PlaceCategory>();
  for (const b of bases) b.categories.forEach((c) => present.add(c));
  const categories = PLACE_CATEGORY_SLUGS.filter((s) => present.has(s));

  if (query.category) bases = bases.filter((b) => b.categories.includes(query.category as PlaceCategory));
  if (query.openNow) {
    bases = bases.filter(
      (b) => computeOpenState(parseBusinessHours(b.row.businessHours), b.row.holidayMode, now)?.status === 'open',
    );
  }

  const ids = bases.map((b) => b.row.id);
  const since = new Date(now.getTime() - RATING_WINDOW_DAYS * DAY_MS);
  const [hhRows, ratings] = await Promise.all([loadHappyHours(db, now, ids), loadTrustedRatings(db, { dealerIds: ids, since })]);
  const { byDealer: boosts, global } = liveBoosts(hhRows, now);
  if (query.boost) bases = bases.filter((b) => boosts.has(b.row.id));

  const sort = query.sort === 'rating' || !origin ? 'rating' : 'distance';
  if (sort === 'distance') {
    bases.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  } else {
    const prior = priorMean([...ratings.values()]);
    const key = (id: string) => {
      const r = ratings.get(id);
      return r && r.n >= RANKING_MIN_REVIEWERS ? bayesScore(r.avg, r.n, prior) : -1;
    };
    bases.sort(
      (a, b) => key(b.row.id) - key(a.row.id) || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || (a.row.businessName ?? '').localeCompare(b.row.businessName ?? '', 'tr'),
    );
  }

  const total = bases.length;
  const page = bases.slice(offset, offset + limit);
  const items = await buildSummaries(db, userId, page, now, { ratings, boosts });
  return {
    mode: origin ? 'nearby' : 'browse',
    items,
    total,
    nextOffset: offset + limit < total ? offset + limit : null,
    categories,
    globalBoost: global,
    radiusKm: origin ? query.radiusKm : null,
  };
}

// ───────────────────────────── Kaydettiklerim ─────────────────────────────

export async function getSavedPlaces(
  userId: string,
  opts: { lat?: number | null; lng?: number | null } = {},
  now: Date = new Date(),
  db: PlacesDb = prisma,
): Promise<SavedResponse> {
  const origin = isValidLatLng(opts.lat, opts.lng) ? { lat: opts.lat as number, lng: opts.lng as number } : null;
  const favs = await db.customerFavoriteDealer.findMany({
    where: { userId, dealer: PUBLIC_DEALER_WHERE },
    select: { dealerId: true, createdAt: true, dealer: { select: DEALER_SELECT } },
    orderBy: { createdAt: 'desc' },
    take: SAVED_LIMIT,
  });
  const names = await loadProductCategoryNames(db, favs.map((f) => f.dealerId));
  const bases: BaseVenue[] = favs.map((f) => ({
    row: f.dealer,
    categories: categorizeDealer({ businessCategory: f.dealer.businessCategory, productCategoryNames: names.get(f.dealerId) ?? [] }),
    distanceKm:
      origin && f.dealer.latitude != null && f.dealer.longitude != null
        ? distanceKm(origin.lat, origin.lng, f.dealer.latitude, f.dealer.longitude)
        : null,
  }));
  const [summaries, recent] = await Promise.all([
    buildSummaries(db, userId, bases, now),
    loadMyVisits(db, userId, { limit: 12 }),
  ]);
  const savedAt = new Map(favs.map((f) => [f.dealerId, f.createdAt]));
  const items: SavedVenueDto[] = summaries.map((s) => ({ ...s, isSaved: true, savedAt: (savedAt.get(s.dealerId) as Date).toISOString() }));

  const savedIds = new Set(savedAt.keys());
  const candidateIds = recent.filter((r) => !savedIds.has(r.dealerId)).map((r) => r.dealerId);
  let suggestions: SavedResponse['suggestions'] = [];
  if (candidateIds.length > 0) {
    const dealers = await db.user.findMany({
      where: { ...PUBLIC_DEALER_WHERE, id: { in: candidateIds } },
      select: { id: true, businessName: true, image: true, businessLogo: true, address: true },
    });
    const byId = new Map(dealers.map((d) => [d.id, d]));
    suggestions = recent
      .filter((r) => byId.has(r.dealerId))
      .slice(0, 3)
      .map((r) => {
        const d = byId.get(r.dealerId)!;
        return { dealerId: d.id, name: d.businessName as string, image: dealerImage(d), address: d.address ?? null, lastVisitAt: r.lastAt.toISOString() };
      });
  }
  return { items, limit: SAVED_LIMIT, suggestions };
}

// ───────────────────────────── Kaydet / kaldır ─────────────────────────────

export type SaveResult = { ok: true; saved: boolean; count: number } | { ok: false; reason: 'NOT_FOUND' | 'LIMIT' };

/** İdempotent kaydet (upsert) — üst sınır kullanıcı başına SAVED_LIMIT. */
export async function savePlace(userId: string, dealerId: string, db: PlacesDb = prisma): Promise<SaveResult> {
  const dealer = await db.user.findFirst({ where: { ...PUBLIC_DEALER_WHERE, id: dealerId }, select: { id: true } });
  if (!dealer) return { ok: false, reason: 'NOT_FOUND' };
  const existing = await db.customerFavoriteDealer.findUnique({
    where: { userId_dealerId: { userId, dealerId } },
    select: { id: true },
  });
  const count = await db.customerFavoriteDealer.count({ where: { userId } });
  if (existing) return { ok: true, saved: true, count };
  if (count >= SAVED_LIMIT) return { ok: false, reason: 'LIMIT' };
  await db.customerFavoriteDealer.upsert({
    where: { userId_dealerId: { userId, dealerId } },
    create: { userId, dealerId },
    update: {},
  });
  return { ok: true, saved: true, count: count + 1 };
}

export async function unsavePlace(userId: string, dealerId: string, db: PlacesDb = prisma): Promise<{ ok: true; saved: false; count: number }> {
  await db.customerFavoriteDealer.deleteMany({ where: { userId, dealerId } });
  const count = await db.customerFavoriteDealer.count({ where: { userId } });
  return { ok: true, saved: false, count };
}

// ───────────────────────────── En iyiler ─────────────────────────────

interface TopBoardDealer {
  dealerId: string;
  name: string;
  image: string | null;
  address: string | null;
  categories: PlaceCategory[];
  n: number;
  avg: number;
}

interface TopBoard {
  generatedAt: string;
  dealers: TopBoardDealer[];
}

/** Kullanıcıdan bağımsız kısım (Redis'te 10 dk). */
export async function computeTopBoard(window: 30 | 90, now: Date = new Date(), db: PlacesDb = prisma): Promise<TopBoard> {
  const since = new Date(now.getTime() - window * DAY_MS);
  const ratings = await loadTrustedRatings(db, { since });
  const eligibleIds = [...ratings.values()].filter((r) => r.n >= RANKING_MIN_REVIEWERS).map((r) => r.dealerId);
  if (eligibleIds.length === 0) return { generatedAt: now.toISOString(), dealers: [] };
  const [rows, names] = await Promise.all([
    db.user.findMany({
      where: { ...PUBLIC_DEALER_WHERE, id: { in: eligibleIds } },
      select: { id: true, businessName: true, image: true, businessLogo: true, address: true, businessCategory: true },
    }),
    loadProductCategoryNames(db, eligibleIds),
  ]);
  const dealers: TopBoardDealer[] = rows.map((r) => {
    const agg = ratings.get(r.id) as RatingAggregate;
    return {
      dealerId: r.id,
      name: r.businessName as string,
      image: dealerImage(r),
      address: r.address ?? null,
      categories: categorizeDealer({ businessCategory: r.businessCategory, productCategoryNames: names.get(r.id) ?? [] }),
      n: agg.n,
      avg: agg.avg,
    };
  });
  return { generatedAt: now.toISOString(), dealers };
}

export async function getTopPlaces(
  userId: string,
  opts: { category?: PlaceCategory | null; window?: 30 | 90 },
  now: Date = new Date(),
  db: PlacesDb = prisma,
): Promise<TopResponse> {
  const window = opts.window === 30 ? 30 : 90;
  const board = await cachedJson(`places:top:v1:${window}`, TOP_CACHE_TTL_S, () => computeTopBoard(window, now, db));
  const counts = new Map<PlaceCategory, number>();
  for (const d of board.dealers) d.categories.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
  const categories = PLACE_CATEGORY_SLUGS.filter((s) => (counts.get(s) ?? 0) > 0).map((slug) => ({ slug, rankedCount: counts.get(slug) ?? 0 }));
  const category = opts.category && counts.has(opts.category) ? opts.category : null;
  const pool = category ? board.dealers.filter((d) => d.categories.includes(category)) : board.dealers;
  const prior = priorMean(pool.map((d) => ({ dealerId: d.dealerId, n: d.n, avg: d.avg })));
  const ranked = rankDealers(pool.map((d) => ({ dealerId: d.dealerId, n: d.n, avg: d.avg })), { prior }).slice(0, TOP_LIMIT);
  const ids = ranked.map((r) => r.dealerId);
  const byId = new Map(pool.map((d) => [d.dealerId, d]));
  const [saved, visits, bom] = await Promise.all([
    loadSavedSet(db, userId, ids),
    loadMyVisits(db, userId, { dealerIds: ids }),
    getBusinessOfMonth().catch(() => null),
  ]);
  const visited = new Set(visits.map((v) => v.dealerId));
  const bomId = bom?.winner?.dealerId ?? null;
  const entries: TopEntryDto[] = ranked.map((r) => {
    const d = byId.get(r.dealerId) as TopBoardDealer;
    return {
      rank: r.rank,
      dealerId: r.dealerId,
      name: d.name,
      image: d.image,
      address: d.address,
      categories: d.categories,
      score: r.score,
      avgRating: Math.round(r.avg * 10) / 10,
      reviewers: r.n,
      isSaved: saved.has(r.dealerId),
      visitedByMe: visited.has(r.dealerId),
      isBusinessOfMonth: bomId === r.dealerId,
    };
  });
  return {
    window,
    category,
    categories,
    entries,
    meta: { minReviewers: RANKING_MIN_REVIEWERS, priorWeight: BAYES_PRIOR_WEIGHT, prior: Math.round(prior * 100) / 100, generatedAt: board.generatedAt },
  };
}

export type { HappyHourRow };
