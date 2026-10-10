/**
 * İçgörüler — sunucu yükleyicisi (sayfa SSR'ı ve BFF aynı fonksiyonu çağırır).
 *
 *  - Kiracı kapsamı çağırandadır (`dealerId` yalnız `resolveDealerScope`/oturumdan gelir).
 *  - Satırlar dönemle SÜZÜLÜR (eski sayfa "haftalık/aylık" seçiminde aynı son 300 kaydı
 *    analiz ediyordu); karşılaştırma dönemi ayrı sorgudur.
 *  - Ağır toplama Redis'te 5 dk önbellekte (`fresh` atlar); aksiyon eşlemesi, anlatı ve kişi
 *    listesi her istekte taze (küçük sorgular).
 *  - GET yan etkisizdir ve LLM ÇAĞIRMAZ (eski sayfa her açılışta rapor üretip aksiyon
 *    otomatik tetikleyicisini 3 kez paralel çalıştırıyordu).
 */
import { prisma } from '@/lib/prisma';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import { istanbulDay } from '@/components/ds/page/date-range';
import {
  aggregateInsights,
  attachActionItems,
  parseEmotions,
  parseEntities,
  parseSuggestions,
  parseThemes,
  type InsightRow,
} from './core';
import { aiAvailability, readNarrative } from './narrative';
import { insightsCacheKey, toInstants } from './params';
import type { InsightsAggregates, InsightsData, InsightsQuery } from './types';

/** Kaynak başına dönem satır tavanı (en yeni N kayıt; aşılırsa `sample.truncated`). */
export const ROW_CAP = 4000;
const CACHE_TTL_SECONDS = 300;
const OPEN_ACTION_STATUSES = ['pending', 'assigned', 'in_progress'];

function hasText(t: string | null | undefined): boolean {
  return typeof t === 'string' && t.trim().length > 0;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function locationWhere(location: string | null): Record<string, unknown> {
  if (!location) return {};
  return location === 'none' ? { locationId: null } : { locationId: location };
}

/** Dönem satırları (QR + tüketim yorumu), en yeni önce. Şube seçiliyse yalnız QR. */
export async function loadRows(
  dealerId: string,
  range: InsightsQuery['range'],
  location: string | null,
  opts: { full: boolean }
): Promise<{ rows: InsightRow[]; truncated: boolean }> {
  const { from, to } = toInstants(range);
  const [qr, cr] = await Promise.all([
    prisma.feedback.findMany({
      where: {
        deletedAt: null,
        createdAt: { gte: from, lt: to },
        qrCode: { dealerId, ...locationWhere(location) },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ROW_CAP + 1,
      select: {
        id: true,
        rating: true,
        sentiment: true,
        text: true,
        aiProcessedAt: true,
        dealerRepliedAt: true,
        createdAt: true,
        npsScore: true,
        urgency: true,
        churnRisk: true,
        effortScore: true,
        intent: true,
        isToxic: true,
        themes: true,
        ...(opts.full ? { entities: true, emotions: true, actionSuggestions: true } : {}),
      },
    }),
    location
      ? Promise.resolve([])
      : prisma.consumptionReview.findMany({
          where: { deletedAt: null, createdAt: { gte: from, lt: to }, consumption: { dealerId } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: ROW_CAP + 1,
          select: {
            id: true,
            rating: true,
            sentiment: true,
            text: true,
            analyzedAt: true,
            dealerRepliedAt: true,
            createdAt: true,
            churnRisk: true,
          },
        }),
  ]);

  const truncated = qr.length > ROW_CAP || cr.length > ROW_CAP;
  const rows: Array<InsightRow & { at: number }> = [];
  for (const f of qr.slice(0, ROW_CAP)) {
    const full = f as typeof f & { entities?: unknown; emotions?: unknown; actionSuggestions?: unknown };
    rows.push({
      id: f.id,
      source: 'qr',
      rating: f.rating,
      sentiment: f.sentiment,
      hasText: hasText(f.text),
      analyzed: f.aiProcessedAt != null,
      replied: f.dealerRepliedAt != null,
      day: istanbulDay(f.createdAt),
      npsScore: num(f.npsScore),
      urgency: num(f.urgency),
      churnRisk: num(f.churnRisk),
      effort: num(f.effortScore),
      intent: f.intent,
      isToxic: f.isToxic === true,
      themes: parseThemes(f.themes),
      entities: opts.full ? parseEntities(full.entities) : [],
      emotions: opts.full ? parseEmotions(full.emotions) : [],
      suggestions: opts.full ? parseSuggestions(full.actionSuggestions) : [],
      at: f.createdAt.getTime(),
    });
  }
  for (const r of (cr as Array<{
    id: string;
    rating: number;
    sentiment: string | null;
    text: string | null;
    analyzedAt: Date | null;
    dealerRepliedAt: Date | null;
    createdAt: Date;
    churnRisk: number | null;
  }>).slice(0, ROW_CAP)) {
    rows.push({
      id: r.id,
      source: 'consumption',
      rating: r.rating,
      sentiment: r.sentiment,
      hasText: hasText(r.text),
      analyzed: r.analyzedAt != null,
      replied: r.dealerRepliedAt != null,
      day: istanbulDay(r.createdAt),
      npsScore: null,
      urgency: null,
      churnRisk: num(r.churnRisk),
      effort: null,
      intent: null,
      isToxic: false,
      themes: [],
      entities: [],
      emotions: [],
      suggestions: [],
      at: r.createdAt.getTime(),
    });
  }
  rows.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
  return { rows: rows.map(({ at: _at, ...rest }) => rest), truncated };
}

function cacheKey(dealerId: string, q: InsightsQuery): string {
  return `dealer-insights:v1:${dealerId}:${insightsCacheKey(q)}`;
}

/** Deterministik toplamlar (önbellekli). */
export async function loadAggregates(
  dealerId: string,
  query: InsightsQuery,
  opts: { fresh?: boolean; now?: Date } = {}
): Promise<InsightsAggregates & { computedAt: string }> {
  const key = cacheKey(dealerId, query);
  if (!opts.fresh) {
    const hit = await redisGetJson<InsightsAggregates & { computedAt: string }>(key);
    if (hit && hit.sample && hit.metrics) return hit;
  }
  const [cur, prev] = await Promise.all([
    loadRows(dealerId, query.range, query.location, { full: true }),
    query.compareRange ? loadRows(dealerId, query.compareRange, query.location, { full: false }) : Promise.resolve(null),
  ]);
  const computedAt = (opts.now ?? new Date()).toISOString();
  const agg = aggregateInsights({
    cur: cur.rows,
    prev: prev ? prev.rows : null,
    range: query.range,
    truncated: cur.truncated,
    asOf: computedAt,
  });
  const result = { ...agg, computedAt };
  await redisSetJson(key, result, CACHE_TTL_SECONDS);
  return result;
}

export async function loadOpenActionItems(dealerId: string): Promise<Array<{ id: string; suggestionText: string }>> {
  return prisma.actionItem.findMany({
    where: { dealerId, status: { in: OPEN_ACTION_STATUSES } },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, suggestionText: true },
  });
}

export async function loadAssignees(dealerId: string): Promise<InsightsData['assignees']> {
  const [owner, staff] = await Promise.all([
    prisma.user.findUnique({ where: { id: dealerId }, select: { id: true, name: true, businessName: true } }),
    prisma.dealerStaff.findMany({
      where: { dealerId, isActive: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { userId: true, user: { select: { name: true } } },
    }),
  ]);
  const out: InsightsData['assignees'] = [];
  if (owner) out.push({ id: owner.id, name: owner.name || owner.businessName || '', self: true });
  for (const s of staff) out.push({ id: s.userId, name: s.user?.name ?? '', self: false });
  return out;
}

export async function loadLocations(dealerId: string): Promise<InsightsData['locations']> {
  return prisma.dealerLocation.findMany({
    where: { dealerId, isActive: true },
    orderBy: { name: 'asc' },
    take: 50,
    select: { id: true, name: true },
  });
}

export async function loadInsights(
  dealerId: string,
  query: InsightsQuery,
  opts: { fresh?: boolean; locale?: 'tr' | 'en'; canWrite?: boolean; now?: Date } = {}
): Promise<InsightsData> {
  const locale = opts.locale ?? 'tr';
  const agg = await loadAggregates(dealerId, query, { fresh: opts.fresh, now: opts.now });
  const [openItems, narrative, ai, locations, assignees] = await Promise.all([
    loadOpenActionItems(dealerId),
    readNarrative(dealerId, query, locale, agg.sample.total, (opts.now ?? new Date()).getTime()),
    aiAvailability(dealerId),
    loadLocations(dealerId),
    opts.canWrite === false ? Promise.resolve([]) : loadAssignees(dealerId),
  ]);
  const { computedAt, ...rest } = agg;
  return {
    ...rest,
    recommendations: attachActionItems(rest.recommendations, openItems),
    query,
    generatedAt: computedAt,
    narrative,
    ai,
    locations,
    assignees,
    canWrite: opts.canWrite !== false,
  };
}
