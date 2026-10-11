/**
 * Bayi → Müşteriler (360) — veri erişimi. Her sorgu `dealerId` ile kapsanır (kiracı her
 * sorguda, §4.4-3); platform geneli `CustomerLifetimeValue` ASLA okunmaz (P0-12).
 *
 * Evren: bayinin müşteri satırları kalıcı `DealerCustomerStats`'tan (günlük iş) okunur; tablo
 * boşsa (iş henüz koşmadı) canlı ve bayi kapsamlı hesaplanır. Liste/özet/sekmeler aynı evreni
 * kullanır → iki sekme aynı müşteri için farklı sayı göstermez. Evren Redis'te 2 dk önbelleklenir.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import { maskEmail } from '@/lib/http/dto';
import { isChannelEnabled } from '@/lib/notification-prefs';
import { computeDealerCustomerStats } from '@/lib/dealer-customer-stats';
import { parseChurnInterventionConfig } from '@/lib/churn-intervention-core';
import {
  DAY_MS,
  STALE_HOURS,
  TAG_LABEL_TR,
  attributeOutcome,
  cooldownSince,
  enrichRows,
  explainReasons,
  filterRows,
  istanbulDayKey,
  legacyChurnBucket,
  monthlyAtStake,
  paginateGuard,
  segmentCards,
  sortRows,
  suggestNextAction,
  summarize,
  toStatRow,
  weeklyAverages,
  type EnrichedRow,
  type ListFilters,
  type SortSpec,
  type StatRow,
} from './core';
import { encodeCustomerRef } from './ref';
import {
  RISK_MEDIUM,
  type ActionHistoryItem,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerListPage,
  type CustomerSignal,
  type CustomerTimelineItem,
  type CustomersSummary,
  type InterventionRunDto,
  type MessageTemplate,
  type RiskOverview,
  type RiskRow,
  type SegmentsOverview,
  type WinBackOverview,
  type WinBackRow,
} from './types';

export type ActorRole = 'DEALER' | 'STAFF' | 'ADMIN';

const UNIVERSE_CACHE_TTL = 120;
const UNIVERSE_CACHE_MAX_ROWS = 3000;
const UNIVERSE_MAX_ROWS = 50_000;
/** Bu yüzeyin pazarlama/aksiyon olay adı (AnalyticsEvent — çalışma kaydı + atıf). */
export const ACTION_EVENT = 'dealer_customer_action';

export interface Universe {
  rows: StatRow[];
  source: 'persisted' | 'live';
  calculatedAt: Date | null;
}

type CachedUniverse = { rows: Array<Record<string, unknown>>; source: 'persisted' | 'live'; calculatedAt: string | null };

function universeKey(dealerId: string) {
  return `dealer-customers:u1:${dealerId}`;
}

/** Bayinin bütün müşteri satırları (yalnız bu bayinin verisi). */
export async function loadUniverse(dealerId: string, now: Date = new Date()): Promise<Universe> {
  const cached = await redisGetJson<CachedUniverse>(universeKey(dealerId));
  if (cached && Array.isArray(cached.rows)) {
    return {
      rows: cached.rows.map((r) => toStatRow(r)),
      source: cached.source === 'live' ? 'live' : 'persisted',
      calculatedAt: cached.calculatedAt ? new Date(cached.calculatedAt) : null,
    };
  }

  const persisted = await prisma.dealerCustomerStats.findMany({
    where: { dealerId },
    select: {
      customerId: true,
      totalSpend: true,
      visitCount: true,
      avgOrderValue: true,
      reviewCount: true,
      avgRating: true,
      firstVisitAt: true,
      lastVisitAt: true,
      churnRisk: true,
      calculatedAt: true,
    },
    take: UNIVERSE_MAX_ROWS,
  });

  let universe: Universe;
  if (Array.isArray(persisted) && persisted.length > 0) {
    let oldest: Date | null = null;
    for (const r of persisted) {
      const at = r.calculatedAt instanceof Date ? r.calculatedAt : null;
      if (at && (!oldest || at < oldest)) oldest = at;
    }
    const rows = persisted.map((r) => toStatRow(r as unknown as Record<string, unknown>));
    universe = { rows: await mergeIntradayDelta(dealerId, rows, oldest, now), source: 'persisted', calculatedAt: oldest };
  } else {
    const live = await computeDealerCustomerStats(dealerId, { now });
    universe = { rows: live.map((s) => toStatRow(s as unknown as Record<string, unknown>)), source: 'live', calculatedAt: null };
  }

  if (universe.rows.length <= UNIVERSE_CACHE_MAX_ROWS) {
    await redisSetJson(
      universeKey(dealerId),
      {
        rows: universe.rows.map((r) => ({
          ...r,
          firstVisitAt: r.firstVisitAt?.toISOString() ?? null,
          lastVisitAt: r.lastVisitAt?.toISOString() ?? null,
        })),
        source: universe.source,
        calculatedAt: universe.calculatedAt?.toISOString() ?? null,
      } satisfies CachedUniverse,
      UNIVERSE_CACHE_TTL
    );
  }
  return universe;
}

/** Gün içi delta için en fazla bu kadar müşteri canlı yeniden hesaplanır (aşarsa yarın). */
const DELTA_MAX_CUSTOMERS = 500;

/**
 * Günlük özet (`calculatedAt`) sonrasında bu işletmede tüketimi olan müşterileri CANLI ve bayi
 * kapsamlı yeniden hesaplayıp kalıcı satırların üstüne yazar. Böylece son hesaplamadan sonra ilk
 * kez gelen müşteri listede/segmentte sessizce eksik kalmaz (customers #27, segment-actions Bulgu 6)
 * ve bugün gelen müşteri hâlâ "uyuyor" görünmez. Hata olursa kalıcı satırlarla devam edilir.
 */
async function mergeIntradayDelta(dealerId: string, rows: StatRow[], since: Date | null, now: Date): Promise<StatRow[]> {
  if (!since) return rows;
  try {
    const changed =
      ((await prisma.consumption.groupBy({
        by: ['customerId'],
        where: { dealerId, createdAt: { gt: since, lte: now } },
        take: DELTA_MAX_CUSTOMERS,
        orderBy: { customerId: 'asc' },
      })) as Array<{ customerId: string }> | undefined) ?? [];
    if (changed.length === 0) return rows;
    const fresh = await computeDealerCustomerStats(dealerId, { now, customerIds: changed.map((c) => c.customerId) });
    const byId = new Map(fresh.map((f) => [f.customerId, toStatRow(f as unknown as Record<string, unknown>)]));
    const merged = rows.map((r) => byId.get(r.customerId) ?? r);
    const known = new Set(rows.map((r) => r.customerId));
    for (const [id, r] of byId) if (!known.has(id)) merged.push(r);
    return merged;
  } catch (err) {
    console.warn('[dealer-customers] gün içi delta hesaplanamadı; kalıcı özetle devam:', err);
    return rows;
  }
}

/* ───────────────────────── Kullanıcı görünümü ───────────────────────── */

type UserLite = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  trustTier: string | null;
  anonymizedAt: Date | null;
};

export async function fetchUsers(ids: ReadonlyArray<string>): Promise<Map<string, UserLite>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const rows =
    (await prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, email: true, image: true, trustTier: true, anonymizedAt: true },
    })) ?? [];
  return new Map((rows as UserLite[]).map((u) => [u.id, u]));
}

/**
 * KVKK (Bulgu 6 / radar 15): e-posta işletmeye ve personele HER ZAMAN maskeli. Platform işletmeye
 * e-posta kanalı açmıyor; tam adres yalnız ifşa riski taşırdı. Anonimleştirilmiş hesapta ad/foto yok.
 */
export function displayUser(u: UserLite | undefined): { name: string | null; email: string | null; image: string | null; anonymized: boolean } {
  if (!u) return { name: null, email: null, image: null, anonymized: false };
  if (u.anonymizedAt) return { name: null, email: null, image: null, anonymized: true };
  return { name: u.name ?? null, email: u.email ? maskEmail(u.email) : null, image: u.image ?? null, anonymized: false };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toListItem(dealerId: string, r: EnrichedRow, u: UserLite | undefined): CustomerListItem {
  const view = displayUser(u);
  return {
    ref: encodeCustomerRef(dealerId, r.customerId),
    ...view,
    totalSpent: r.totalSpend,
    totalVisits: r.visitCount,
    avgOrderValue: r.avgOrderValue,
    firstVisitAt: iso(r.firstVisitAt),
    lastPurchaseAt: iso(r.lastVisitAt),
    daysSinceLast: r.daysSinceLast,
    rhythmDays: r.rhythmDays,
    predictedChurn: r.churnRisk,
    churnRisk: legacyChurnBucket(r.risk),
    risk: r.risk,
    tags: r.tags,
    band: r.band,
    reviewCount: r.reviewCount,
    avgRating: r.avgRating,
    trustScore: null,
    trustTier: u?.trustTier === 'trusted' && !u.anonymizedAt ? 'trusted' : null,
  };
}

/* ───────────────────────── Liste ───────────────────────── */

export interface ListQuery extends ListFilters {
  q: string;
  sort: SortSpec;
  page: number;
  pageSize: number;
}

async function searchIds(allIds: string[], q: string): Promise<Set<string>> {
  if (!q) return new Set(allIds);
  const or: Prisma.UserWhereInput[] = [{ name: { contains: q, mode: 'insensitive' } }];
  // E-posta ile arama yalnız TAM adres eşleşmesinde (maskeli gösterilen adres tahminle taranamasın).
  if (q.includes('@')) or.push({ email: { equals: q, mode: 'insensitive' } });
  const rows =
    (await prisma.user.findMany({
      where: { id: { in: allIds }, anonymizedAt: null, OR: or },
      select: { id: true },
      take: 5000,
    })) ?? [];
  return new Set(rows.map((r) => r.id));
}

export async function selectRows(dealerId: string, query: Omit<ListQuery, 'page' | 'pageSize'>, now: Date) {
  const universe = await loadUniverse(dealerId, now);
  const { rows } = enrichRows(universe.rows, now);
  const allow = query.q ? await searchIds(rows.map((r) => r.customerId), query.q) : null;
  const filtered = sortRows(filterRows(rows, query, allow), query.sort);
  return { universe, filtered };
}

export async function listCustomers(dealerId: string, query: ListQuery, now: Date = new Date()): Promise<CustomerListPage> {
  const { universe, filtered } = await selectRows(dealerId, query, now);
  const { page, pageSize, start } = paginateGuard(filtered.length, query.page, query.pageSize);
  const slice = filtered.slice(start, start + pageSize);
  const users = await fetchUsers(slice.map((r) => r.customerId));
  return {
    items: slice.map((r) => toListItem(dealerId, r, users.get(r.customerId))),
    total: filtered.length,
    page,
    pageSize,
    source: universe.source,
    calculatedAt: iso(universe.calculatedAt),
  };
}

/* ───────────────────────── Özet ───────────────────────── */

export async function getSummary(dealerId: string, now: Date = new Date()): Promise<CustomersSummary> {
  const universe = await loadUniverse(dealerId, now);
  const { rows } = enrichRows(universe.rows, now);
  const s = summarize(rows, now);
  const stale =
    universe.source === 'persisted' && universe.calculatedAt != null
      ? now.getTime() - universe.calculatedAt.getTime() > STALE_HOURS * 60 * 60 * 1000
      : false;
  return { ...s, source: universe.source, calculatedAt: iso(universe.calculatedAt), stale };
}

/* ───────────────────────── İletişim geçmişi (sıklık tavanı) ───────────────────────── */

function isMarketingKind(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const kind = (data as Record<string, unknown>).kind;
  return typeof kind === 'string' && kind.startsWith('campaign');
}

/**
 * Bu işletmeden son `since` sonrası pazarlama iletisi ya da kişisel teklif almış müşteriler
 * (müşteri → en son temas anı). Sıklık tavanı ve "iletişim kuruldu" rozeti bunu kullanır.
 */
export async function lastContactMap(dealerId: string, ids: ReadonlyArray<string>, since: Date): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return out;
  const [notifications, offers] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: { in: unique }, createdAt: { gte: since }, data: { path: ['dealerId'], equals: dealerId } },
      select: { userId: true, createdAt: true, data: true },
      take: 5000,
    }),
    prisma.remedyOffer.findMany({
      where: { dealerId, userId: { in: unique }, createdAt: { gte: since }, feedbackId: null, consumptionReviewId: null },
      select: { userId: true, createdAt: true },
      take: 5000,
    }),
  ]);
  const bump = (id: string, at: Date) => {
    const prev = out.get(id);
    if (!prev || at > prev) out.set(id, at);
  };
  for (const n of notifications ?? []) if (isMarketingKind(n.data)) bump(n.userId, n.createdAt);
  for (const o of offers ?? []) bump(o.userId, o.createdAt);
  return out;
}

/* ───────────────────────── 360 detay ───────────────────────── */

/** AI aciliyet eşiği ("Acil" rozeti). */
const URGENT_AT = 0.7;
const SENTIMENT_TONE: Record<string, CustomerTimelineItem['tone']> = { positive: 'success', negative: 'danger', neutral: 'neutral' };
const REMEDY_STATUS_TR: Record<string, string> = {
  pending: 'müşterinin seçimini bekliyor',
  awaiting_dealer_approval: 'onay kuyruğunda',
  accepted: 'kabul edildi',
  rejected: 'reddedildi',
  expired: 'süresi doldu',
};

function clip(s: string | null | undefined, n: number): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export async function getCustomerDetail(dealerId: string, customerId: string, now: Date = new Date()): Promise<CustomerDetail | null> {
  const universe = await loadUniverse(dealerId, now);
  const { rows } = enrichRows(universe.rows, now);
  const row = rows.find((r) => r.customerId === customerId);
  // Bu işletmede tüketimi olmayan kişi bu işletmenin "müşterisi" değildir → 404 (sızıntı yok).
  if (!row) return null;

  const since180 = new Date(now.getTime() - 180 * DAY_MS);
  const [user, visits, feedbacks, reviews, offers, messages] = await Promise.all([
    prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, email: true, image: true, trustTier: true, anonymizedAt: true, role: true, notificationPrefs: true },
    }),
    prisma.consumption.findMany({
      where: { dealerId, customerId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, createdAt: true, amount: true, product: { select: { name: true } } },
    }),
    prisma.feedback.findMany({
      where: { qrCode: { dealerId }, userId: customerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, rating: true, text: true, sentiment: true, churnRisk: true, intent: true, urgency: true, dealerReply: true, createdAt: true, trustFlagged: true },
    }),
    prisma.consumptionReview.findMany({
      where: { customerId, consumption: { dealerId }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, rating: true, text: true, sentiment: true, churnRisk: true, dealerReply: true, createdAt: true },
    }),
    prisma.remedyOffer.findMany({
      where: { dealerId, userId: customerId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, status: true, createdAt: true, acceptedAt: true, feedbackId: true, consumptionReviewId: true },
    }),
    prisma.notification.findMany({
      where: { userId: customerId, createdAt: { gte: since180 }, data: { path: ['dealerId'], equals: dealerId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, title: true, message: true, createdAt: true, data: true },
    }),
  ]);

  const u = user ? (user as unknown as UserLite & { role: string; notificationPrefs: unknown }) : undefined;
  const item = toListItem(dealerId, row, u);

  const signals: CustomerSignal[] = [
    ...(feedbacks ?? [])
      .filter((f) => !f.trustFlagged)
      .map((f) => ({
        id: f.id,
        type: 'feedback' as const,
        rating: f.rating,
        text: clip(f.text, 400),
        sentiment: f.sentiment,
        churnRisk: f.churnRisk,
        intent: f.intent ?? null,
        urgent: (f.urgency ?? 0) >= URGENT_AT,
        replied: !!f.dealerReply,
        reply: clip(f.dealerReply, 300),
        at: f.createdAt.toISOString(),
      })),
    ...(reviews ?? []).map((r) => ({
      id: r.id,
      type: 'review' as const,
      rating: r.rating,
      text: clip(r.text, 400),
      sentiment: r.sentiment,
      churnRisk: r.churnRisk,
      intent: null,
      urgent: false,
      replied: !!r.dealerReply,
      reply: clip(r.dealerReply, 300),
      at: r.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const latest = signals[0];
  const latestNegativeUnanswered = !!latest && !latest.replied && (latest.rating <= 2 || latest.sentiment === 'negative' || (latest.churnRisk ?? 0) >= RISK_MEDIUM);

  const marketing = (messages ?? []).filter((m) => isMarketingKind(m.data));
  const personalOffers = (offers ?? []).filter((o) => !o.feedbackId && !o.consumptionReviewId);
  const contactTimes = [...marketing.map((m) => m.createdAt), ...personalOffers.map((o) => o.createdAt)].sort((a, b) => b.getTime() - a.getTime());
  const lastContact = contactTimes[0] ?? null;
  const contactedRecently = !!lastContact && lastContact >= cooldownSince(now);
  const openOfferRow = (offers ?? []).find((o) => o.status === 'pending' || o.status === 'awaiting_dealer_approval');

  const isCustomerAccount = !!u && u.role === 'CUSTOMER' && !u.anonymizedAt;
  const reachable =
    isCustomerAccount &&
    (isChannelEnabled(u!.notificationPrefs, 'campaign', 'app') || isChannelEnabled(u!.notificationPrefs, 'campaign', 'push'));

  const timeline: CustomerTimelineItem[] = [
    ...(visits ?? []).map((v) => ({
      id: `v-${v.id}`,
      kind: 'visit' as const,
      at: v.createdAt.toISOString(),
      title: v.product?.name ? `Ziyaret · ${v.product.name}` : 'Ziyaret',
      detail: v.amount != null ? `${Math.round(v.amount * 100) / 100} ₺` : null,
      tone: 'brand' as const,
    })),
    ...signals.map((s) => ({
      id: `${s.type === 'feedback' ? 'f' : 'r'}-${s.id}`,
      kind: s.type,
      at: s.at,
      title: `${s.type === 'feedback' ? 'QR geri bildirimi' : 'Tüketim yorumu'} · ${s.rating}/5${s.replied ? ' · yanıtlandı' : ''}`,
      detail: s.text,
      tone: SENTIMENT_TONE[s.sentiment ?? ''] ?? (s.rating <= 2 ? 'danger' : 'neutral'),
    })),
    ...(offers ?? []).map((o) => ({
      id: `o-${o.id}`,
      kind: 'remedy' as const,
      at: o.createdAt.toISOString(),
      title: o.feedbackId || o.consumptionReviewId ? 'Telafi teklifi' : 'Kişisel teklif',
      detail: REMEDY_STATUS_TR[o.status] ?? o.status,
      tone: (o.status === 'accepted' ? 'success' : o.status === 'pending' || o.status === 'awaiting_dealer_approval' ? 'warning' : 'neutral') as CustomerTimelineItem['tone'],
    })),
    ...marketing.map((m) => ({
      id: `m-${m.id}`,
      kind: 'message' as const,
      at: m.createdAt.toISOString(),
      title: `İleti gönderildi · ${m.title}`,
      detail: clip(m.message, 160),
      tone: 'info' as const,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40);

  const reasons = explainReasons({
    churnRisk: row.churnRisk,
    band: row.band,
    daysSinceLast: row.daysSinceLast,
    rhythmDays: row.rhythmDays,
    avgRating: row.avgRating,
    reviewCount: row.reviewCount,
    latestNegativeUnanswered,
    openOffer: !!openOfferRow,
  });

  return {
    ...item,
    reasons,
    suggestion: suggestNextAction({
      tags: row.tags,
      band: row.band,
      risk: row.risk,
      latestNegativeUnanswered,
      reachable,
      contactedRecently,
      openOffer: !!openOfferRow,
    }),
    reachable,
    contactedRecently,
    lastContactAt: iso(lastContact),
    openOffer: openOfferRow ? { status: openOfferRow.status, at: openOfferRow.createdAt.toISOString() } : null,
    signals: signals.slice(0, 8),
    timeline,
  };
}

/* ───────────────────────── Risk sekmesi ───────────────────────── */

const RISK_LIST_MAX = 100;

export async function getRiskOverview(dealerId: string, now: Date = new Date()): Promise<RiskOverview> {
  const universe = await loadUniverse(dealerId, now);
  const { rows } = enrichRows(universe.rows, now);
  const distribution = { high: 0, medium: 0, low: 0, unknown: 0 };
  let riskSum = 0;
  let riskN = 0;
  for (const r of rows) {
    distribution[r.risk]++;
    if (r.churnRisk != null) {
      riskSum += r.churnRisk;
      riskN++;
    }
  }
  const risky = rows
    .filter((r) => r.churnRisk != null && r.churnRisk >= RISK_MEDIUM)
    .sort((a, b) => (b.churnRisk ?? 0) - (a.churnRisk ?? 0) || b.totalSpend - a.totalSpend)
    .slice(0, RISK_LIST_MAX);
  const ids = risky.map((r) => r.customerId);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since56 = new Date(now.getTime() - 56 * DAY_MS);

  const [fbSignals, crSignals, offers, users, anonymousHighRisk30d, flaggedExcluded30d, fbTrend, crTrend, dealer, runs] = await Promise.all([
    ids.length
      ? prisma.feedback.findMany({
          where: { qrCode: { dealerId }, deletedAt: null, trustFlagged: false, userId: { in: ids }, churnRisk: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 400,
          select: { id: true, userId: true, rating: true, text: true, sentiment: true, churnRisk: true, intent: true, urgency: true, dealerReply: true, createdAt: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.consumptionReview.findMany({
          where: { consumption: { dealerId }, deletedAt: null, customerId: { in: ids }, churnRisk: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 400,
          select: { id: true, customerId: true, rating: true, text: true, sentiment: true, churnRisk: true, dealerReply: true, createdAt: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.remedyOffer.findMany({
          where: { dealerId, userId: { in: ids }, createdAt: { gte: new Date(now.getTime() - 90 * DAY_MS) } },
          select: { userId: true, status: true, createdAt: true },
          take: 1000,
        })
      : Promise.resolve([]),
    fetchUsers(ids),
    prisma.feedback.count({
      where: { qrCode: { dealerId }, deletedAt: null, userId: null, churnRisk: { gte: 0.5 }, createdAt: { gte: since30 } },
    }),
    prisma.feedback.count({
      where: { qrCode: { dealerId }, deletedAt: null, trustFlagged: true, churnRisk: { gte: 0.5 }, createdAt: { gte: since30 } },
    }),
    prisma.feedback.findMany({
      where: { qrCode: { dealerId }, deletedAt: null, trustFlagged: false, churnRisk: { not: null }, createdAt: { gte: since56 } },
      select: { churnRisk: true, createdAt: true },
      take: 5000,
    }),
    prisma.consumptionReview.findMany({
      where: { consumption: { dealerId }, deletedAt: null, churnRisk: { not: null }, createdAt: { gte: since56 } },
      select: { churnRisk: true, createdAt: true },
      take: 5000,
    }),
    prisma.user.findUnique({ where: { id: dealerId }, select: { dealerChurnIntervention: true } }),
    prisma.analyticsEvent.findMany({
      where: { userId: dealerId, event: 'churn_intervention', category: 'dealer', createdAt: { gte: since30 } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: { createdAt: true, data: true },
    }),
  ]);

  // Müşteri başına en güncel sinyal (yorum satırı değil, MÜŞTERİ tekilleştirilir — Bulgu 4).
  const latestByCustomer = new Map<string, CustomerSignal>();
  const consider = (customerId: string | null, s: CustomerSignal) => {
    if (!customerId) return;
    const prev = latestByCustomer.get(customerId);
    if (!prev || s.at > prev.at) latestByCustomer.set(customerId, s);
  };
  for (const f of fbSignals ?? []) {
    consider(f.userId, {
      id: f.id, type: 'feedback', rating: f.rating, text: clip(f.text, 200), sentiment: f.sentiment, churnRisk: f.churnRisk,
      intent: f.intent ?? null, urgent: (f.urgency ?? 0) >= URGENT_AT,
      replied: !!f.dealerReply, reply: null, at: f.createdAt.toISOString(),
    });
  }
  for (const r of crSignals ?? []) {
    consider(r.customerId, {
      id: r.id, type: 'review', rating: r.rating, text: clip(r.text, 200), sentiment: r.sentiment, churnRisk: r.churnRisk,
      intent: null, urgent: false,
      replied: !!r.dealerReply, reply: null, at: r.createdAt.toISOString(),
    });
  }
  const offerByCustomer = new Map<string, Date>();
  for (const o of offers ?? []) {
    const prev = offerByCustomer.get(o.userId);
    if (!prev || o.createdAt > prev) offerByCustomer.set(o.userId, o.createdAt);
  }

  const counts = { open: 0, handled: 0, recovered: 0 };
  const riskRows: RiskRow[] = risky.map((r) => {
    const signal = latestByCustomer.get(r.customerId) ?? null;
    const signalAt = signal ? new Date(signal.at) : null;
    let status: RiskRow['status'] = 'open';
    if (signalAt && r.lastVisitAt && r.lastVisitAt > signalAt) status = 'recovered';
    else if (signal?.replied || (offerByCustomer.get(r.customerId) && (!signalAt || offerByCustomer.get(r.customerId)! >= signalAt))) status = 'handled';
    counts[status]++;
    const view = displayUser(users.get(r.customerId));
    return {
      ref: encodeCustomerRef(dealerId, r.customerId),
      name: view.name,
      image: view.image,
      anonymized: view.anonymized,
      churn: r.churnRisk ?? 0,
      risk: r.risk,
      lastPurchaseAt: iso(r.lastVisitAt),
      daysSinceLast: r.daysSinceLast,
      totalSpent: r.totalSpend,
      status,
      signal,
    };
  });

  const trendPoints = [...(fbTrend ?? []), ...(crTrend ?? [])]
    .filter((p): p is { churnRisk: number; createdAt: Date } => p.churnRisk != null)
    .map((p) => ({ at: p.createdAt, value: p.churnRisk }));

  const cfg = parseChurnInterventionConfig(dealer?.dealerChurnIntervention);
  const runDtos = await groupInterventionRuns(dealerId, runs ?? []);

  return {
    rows: riskRows,
    counts,
    distribution,
    avgRisk: riskN > 0 ? Math.round((riskSum / riskN) * 1000) / 1000 : null,
    weekly: weeklyAverages(trendPoints, now, 8),
    weeklyN: trendPoints.length,
    anonymousHighRisk30d: anonymousHighRisk30d ?? 0,
    flaggedExcluded30d: flaggedExcluded30d ?? 0,
    intervention: {
      config: {
        enabled: cfg.enabled,
        thresholdPercent: Math.round(cfg.churnThreshold * 100),
        inactiveDays: cfg.inactiveDays,
        autoOffer: cfg.autoFlashOffer,
        maxPerRun: cfg.maxPerRun,
      },
      runs: runDtos,
    },
  };
}

/** Otomatik müdahalenin işaretlediği müşteriler — gün bazında (eskiden hiçbir ekran okumuyordu). */
async function groupInterventionRuns(
  dealerId: string,
  events: ReadonlyArray<{ createdAt: Date; data: unknown }>
): Promise<InterventionRunDto[]> {
  const byDay = new Map<string, { flagged: number; offers: number; ids: string[] }>();
  for (const e of events) {
    const d = (e.data ?? {}) as { customerId?: unknown; autoOffer?: unknown };
    const day = istanbulDayKey(e.createdAt);
    const g = byDay.get(day) ?? { flagged: 0, offers: 0, ids: [] };
    g.flagged++;
    if (d.autoOffer === true) g.offers++;
    if (typeof d.customerId === 'string' && g.ids.length < 8) g.ids.push(d.customerId);
    byDay.set(day, g);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10);
  const users = await fetchUsers(days.flatMap(([, g]) => g.ids));
  return days.map(([day, g]) => ({
    day,
    flagged: g.flagged,
    offers: g.offers,
    customers: g.ids.map((id) => ({ ref: encodeCustomerRef(dealerId, id), name: displayUser(users.get(id)).name })),
  }));
}

/* ───────────────────────── Geri kazanım sekmesi ───────────────────────── */

const WINBACK_LIST_MAX = 200;

export async function getWinBackOverview(dealerId: string, now: Date = new Date()): Promise<WinBackOverview> {
  const universe = await loadUniverse(dealerId, now);
  const { rows } = enrichRows(universe.rows, now);
  const candidates = rows.filter((r) => r.band).sort((a, b) => b.priority - a.priority || (a.daysSinceLast ?? 0) - (b.daysSinceLast ?? 0));
  const bands = { waking: 0, sleeping: 0, lost: 0 };
  for (const r of candidates) bands[r.band!]++;
  const top = candidates.slice(0, WINBACK_LIST_MAX);
  const ids = top.map((r) => r.customerId);
  const [users, contacts, history] = await Promise.all([
    fetchUsers(ids),
    lastContactMap(dealerId, ids, cooldownSince(now)),
    listActionHistory(dealerId, now, { days: 30, limit: 50 }),
  ]);
  const winbackRuns = history.filter((h) => h.template === 'winback' || h.audienceLabel.startsWith('Geri kazanım') || h.action === 'personal_offer');
  const results30d = winbackRuns.reduce(
    (acc, h) => ({ runs: acc.runs + 1, sent: acc.sent + h.sent, returned: acc.returned + h.returned, revenue: acc.revenue + h.revenue }),
    { runs: 0, sent: 0, returned: 0, revenue: 0 }
  );

  const out: WinBackRow[] = top.map((r) => {
    const view = displayUser(users.get(r.customerId));
    return {
      ref: encodeCustomerRef(dealerId, r.customerId),
      name: view.name,
      image: view.image,
      anonymized: view.anonymized,
      band: r.band!,
      daysSinceLast: r.daysSinceLast ?? 0,
      rhythmDays: r.rhythmDays,
      visits: r.visitCount,
      avgOrderValue: r.avgOrderValue,
      totalSpent: r.totalSpend,
      priority: r.priority,
      contacted: contacts.has(r.customerId),
    };
  });
  return { rows: out, total: candidates.length, bands, monthlyAtStake: monthlyAtStake(rows), results30d };
}

/* ───────────────────────── Segmentler sekmesi ───────────────────────── */

export async function getSegmentsOverview(dealerId: string, now: Date = new Date()): Promise<SegmentsOverview> {
  const universe = await loadUniverse(dealerId, now);
  const { rows, vipThreshold } = enrichRows(universe.rows, now);
  const history = await listActionHistory(dealerId, now, { days: 90, limit: 50 });
  const lastByTag = new Map<string, { at: string; sent: number }>();
  for (const h of history) {
    const tag = (h as ActionHistoryItem & { segmentTag?: string }).segmentTag;
    if (tag && !lastByTag.has(tag)) lastByTag.set(tag, { at: h.at, sent: h.sent });
  }
  const cards = segmentCards(rows).map((c) => ({ ...c, lastAction: lastByTag.get(c.tag) ?? null }));
  return {
    segments: cards,
    totalCustomers: rows.length,
    untagged: rows.filter((r) => r.tags.length === 0).length,
    vipThreshold,
    source: universe.source,
    calculatedAt: iso(universe.calculatedAt),
  };
}

/* ───────────────────────── Aksiyon geçmişi + atıf ───────────────────────── */

export interface ActionEventData {
  runId: string;
  actorId: string;
  action: 'message' | 'personal_offer';
  template: MessageTemplate | null;
  audience: { kind: string; tag?: string; band?: string; count?: number };
  audienceLabel: string;
  recipients: string[];
  sent: number;
  offersCreated: number;
  conflicts: number;
  skipped: { optedOut: number; cooldown: number; ineligible: number; overCap: number };
}

export async function listActionHistory(
  dealerId: string,
  now: Date,
  opts: { days: number; limit: number }
): Promise<Array<ActionHistoryItem & { segmentTag?: string }>> {
  const since = new Date(now.getTime() - opts.days * DAY_MS);
  const events =
    (await prisma.analyticsEvent.findMany({
      where: { userId: dealerId, event: ACTION_EVENT, category: 'dealer', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
      select: { id: true, createdAt: true, data: true },
    })) ?? [];
  if (events.length === 0) return [];

  const parsed = events.map((e) => ({ e, d: (e.data ?? {}) as Partial<ActionEventData> }));
  const recipients = [...new Set(parsed.flatMap(({ d }) => (Array.isArray(d.recipients) ? d.recipients : [])))];
  const minSent = parsed.reduce((m, { e }) => (e.createdAt < m ? e.createdAt : m), now);
  const visits = recipients.length
    ? ((await prisma.consumption.findMany({
        where: { dealerId, customerId: { in: recipients }, createdAt: { gt: minSent, lte: new Date(now.getTime()) } },
        select: { customerId: true, createdAt: true, amount: true },
        take: 10_000,
      })) ?? [])
    : [];

  return parsed.map(({ e, d }) => {
    const outcome = attributeOutcome(e.createdAt, Array.isArray(d.recipients) ? d.recipients : [], visits, now);
    return {
      id: e.id,
      at: e.createdAt.toISOString(),
      action: d.action === 'personal_offer' ? 'personal_offer' : 'message',
      template: (d.template as MessageTemplate | null) ?? null,
      audienceLabel: typeof d.audienceLabel === 'string' ? d.audienceLabel : 'Müşteriler',
      sent: typeof d.sent === 'number' ? d.sent + (typeof d.offersCreated === 'number' ? d.offersCreated : 0) : 0,
      returned: outcome.returned,
      revenue: outcome.revenue,
      windowOpen: outcome.windowOpen,
      segmentTag: d.audience?.kind === 'segment' && typeof d.audience.tag === 'string' ? d.audience.tag : undefined,
    };
  });
}

export function audienceLabelOf(a: { kind: string; tag?: string; band?: string; count?: number }): string {
  if (a.kind === 'segment' && a.tag && a.tag in TAG_LABEL_TR) return `Segment: ${TAG_LABEL_TR[a.tag as keyof typeof TAG_LABEL_TR]}`;
  if (a.kind === 'band') {
    const label = a.band === 'waking' ? 'uyanmak üzere' : a.band === 'sleeping' ? 'uyuyor' : a.band === 'lost' ? 'kayıp' : 'tümü';
    return `Geri kazanım: ${label}`;
  }
  return `Seçili ${a.count ?? 0} müşteri`;
}

