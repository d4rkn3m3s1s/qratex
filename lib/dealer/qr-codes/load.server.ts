/**
 * QR kodlar ve şubeler (/dealer/qr-codes) — sunucu OKUMA katmanı. Sayfa (SSR) ve BFF uçları
 * AYNI fonksiyonları çağırır; kiracı kapsamı çağıranın verdiği `dealerId`'dir (rota
 * `resolveDealerScope` ile çözer).
 *
 * Sayıların tanımı (denetim Bulgu 2, 5):
 *  - Tarama = tekilleştirilmiş `qr_scanned` olayı (AnalyticsEvent; geri bildirim sayfası beacon'ı).
 *    `QRCode.scanCount` KULLANILMAZ (geçmişte gönderim sayıyordu).
 *  - Yorum = silinmemiş Feedback. Dönüşüm = yorum / tarama (aynı pencere).
 *  - Özet sayıları sayfalamadan bağımsız, sunucuda agregedir; durum tanımı `deriveQrStatus`.
 *  - Günler Europe/Istanbul.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { siteUrl } from '@/lib/site-config';
import { getDealerPlanLimits } from '@/lib/plan-limits';
import { liveQrWhere } from '@/lib/qr-quota';
import {
  QR_PAGE_SIZE,
  QR_SPARK_DAYS,
  QR_STATS_DAYS,
  deriveQrStatus,
  isExpiringSoon,
  istanbulDay,
  linksFromSegmentConfig,
  statusWhere,
  type QrListFilters,
  type QrStatusFilter,
} from './rules';
import type {
  LocationDto,
  LocationsDto,
  QrDetailDto,
  QrHistoryEntry,
  QrItemDto,
  QrListDto,
  QrStatsDto,
  QrSummaryDto,
  QuotaDto,
} from './types';

const DAY_MS = 86_400_000;

// ───────────────────────────── Yardımcılar ─────────────────────────────

/** Kanonik geri bildirim adresi — basılı QR'ın içeriği (rapor Bulgu 3: window.location.origin değil). */
export function buildQrTargetUrl(code: string): string {
  return `${siteUrl}/feedback/${encodeURIComponent(code)}`;
}

export function siteHost(): string {
  try {
    return new URL(siteUrl).host.replace(/^www\./, '');
  } catch {
    return 'qratex';
  }
}

/** Son `n` İstanbul günü (eskiden yeniye) `YYYY-MM-DD`. */
export function lastIstanbulDays(n: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(istanbulDay(new Date(now.getTime() - i * DAY_MS)));
  return out;
}

/** Bir İstanbul gününün başlangıcı (UTC anı). Türkiye 2016'dan beri sabit UTC+3. */
export function istanbulDayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000+03:00`);
}

function toNum(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v) || 0;
  return 0;
}

const IST_DAY = (col: Prisma.Sql) => Prisma.sql`to_char(((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul'), 'YYYY-MM-DD')`;

/** QR başına, gün başına tarama (dealerId JSON alanıyla kapsamlı). `ids` boşsa tüm kodlar. */
async function scansByQrDay(dealerId: string, since: Date, ids: string[] | null) {
  if (ids && ids.length === 0) return [] as Array<{ qr_id: string; day: string; n: number }>;
  const idFilter = ids ? Prisma.sql` AND e."data"->>'qrCodeId' IN (${Prisma.join(ids)})` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ qr_id: string | null; day: string; n: unknown }>>(Prisma.sql`
    SELECT e."data"->>'qrCodeId' AS qr_id, ${IST_DAY(Prisma.sql`e."createdAt"`)} AS day, COUNT(*)::bigint AS n
      FROM "AnalyticsEvent" e
     WHERE e."event" = 'qr_scanned'
       AND e."createdAt" >= ${since}
       AND e."data"->>'dealerId' = ${dealerId}${idFilter}
     GROUP BY 1, 2`);
  return rows.filter((r) => r.qr_id).map((r) => ({ qr_id: r.qr_id as string, day: r.day, n: toNum(r.n) }));
}

const QR_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  isActive: true,
  expiresAt: true,
  revokedAt: true,
  archivedAt: true,
  createdAt: true,
  segmentConfig: true,
  location: { select: { id: true, name: true, isActive: true } },
  _count: { select: { feedbacks: { where: { deletedAt: null } } } },
} satisfies Prisma.QRCodeSelect;

type QrRow = Prisma.QRCodeGetPayload<{ select: typeof QR_SELECT }>;

function emptyStats(): QrStatsDto {
  return { scans: 0, feedbacks: 0, conversion: null, avgRating: null, spark: new Array(QR_SPARK_DAYS).fill(0) };
}

export function conversionPct(feedbacks: number, scans: number): number | null {
  if (scans <= 0) return null;
  return Math.round((feedbacks / scans) * 1000) / 10;
}

/** QR'lar için 30 günlük tarama/yorum/puan + 14 günlük çizgi. */
async function statsFor(dealerId: string, ids: string[], now: Date): Promise<Map<string, QrStatsDto>> {
  const out = new Map<string, QrStatsDto>();
  for (const id of ids) out.set(id, emptyStats());
  if (ids.length === 0) return out;
  const days = lastIstanbulDays(QR_STATS_DAYS, now);
  const since = istanbulDayStart(days[0]);
  const sparkDays = days.slice(-QR_SPARK_DAYS);
  const sparkIdx = new Map(sparkDays.map((d, i) => [d, i]));
  const [scanRows, fb] = await Promise.all([
    scansByQrDay(dealerId, since, ids),
    prisma.feedback.groupBy({
      by: ['qrCodeId'],
      where: { qrCodeId: { in: ids }, deletedAt: null, createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { rating: true },
    }),
  ]);
  for (const r of scanRows) {
    const s = out.get(r.qr_id);
    if (!s) continue;
    s.scans += r.n;
    const i = sparkIdx.get(r.day);
    if (i != null) s.spark[i] += r.n;
  }
  for (const g of fb) {
    const s = out.get(g.qrCodeId);
    if (!s) continue;
    s.feedbacks = g._count._all;
    s.avgRating = g._avg.rating == null ? null : Math.round(g._avg.rating * 10) / 10;
  }
  for (const s of out.values()) s.conversion = conversionPct(s.feedbacks, s.scans);
  return out;
}

function toItem(row: QrRow, stats: QrStatsDto, now: Date): QrItemDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    status: deriveQrStatus(row, now),
    isActive: row.isActive,
    expiringSoon: isExpiringSoon(row, now),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    location: row.location,
    targetUrl: buildQrTargetUrl(row.code),
    feedbackTotal: row._count.feedbacks,
    linkCount: linksFromSegmentConfig(row.segmentConfig).length,
    stats,
  };
}

// ───────────────────────────── Liste ─────────────────────────────

export function listWhere(dealerId: string, f: QrListFilters, now: Date): Prisma.QRCodeWhereInput {
  const and: Prisma.QRCodeWhereInput[] = [{ dealerId }, statusWhere(f.status, now) as Prisma.QRCodeWhereInput];
  if (f.location === 'none') and.push({ locationId: null });
  else if (f.location) and.push({ locationId: f.location });
  if (f.q) {
    and.push({
      OR: [
        { name: { contains: f.q, mode: 'insensitive' } },
        { code: { contains: f.q, mode: 'insensitive' } },
        { description: { contains: f.q, mode: 'insensitive' } },
        { location: { name: { contains: f.q, mode: 'insensitive' } } },
      ],
    });
  }
  return { AND: and };
}

export function listOrderBy(sort: QrListFilters['sort']): Prisma.QRCodeOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'name':
      return [{ name: 'asc' }, { id: 'asc' }];
    case 'expiry':
      return [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }];
    case 'newest':
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

export async function loadQrList(dealerId: string, filters: QrListFilters, now = new Date()): Promise<QrListDto> {
  const where = listWhere(dealerId, filters, now);
  const total = await prisma.qRCode.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / QR_PAGE_SIZE));
  // Son sayfadaki son kayıt arşivlenince "Sayfa 3 / 2" kalmasın (rapor #41).
  const page = Math.min(Math.max(1, filters.page), totalPages);
  const rows = await prisma.qRCode.findMany({
    where,
    orderBy: listOrderBy(filters.sort),
    skip: (page - 1) * QR_PAGE_SIZE,
    take: QR_PAGE_SIZE,
    select: QR_SELECT,
  });
  const stats = await statsFor(dealerId, rows.map((r) => r.id), now);
  return {
    items: rows.map((r) => toItem(r, stats.get(r.id) ?? emptyStats(), now)),
    total,
    page,
    pageSize: QR_PAGE_SIZE,
    totalPages,
    filters: { ...filters, page },
    generatedAt: now.toISOString(),
  };
}

// ───────────────────────────── Özet ─────────────────────────────

async function businessNameOf(dealerId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: dealerId }, select: { businessName: true, name: true } });
  return (u?.businessName || u?.name || 'İşletmemiz').trim();
}

export async function loadQrQuota(dealerId: string): Promise<{ quota: QuotaDto; branchQuota: QuotaDto }> {
  const [limits, live, branches] = await Promise.all([
    getDealerPlanLimits(dealerId),
    prisma.qRCode.count({ where: liveQrWhere(dealerId) }),
    prisma.dealerLocation.count({ where: { dealerId, isActive: true } }),
  ]);
  return {
    quota: { used: live, limit: limits.maxQRCodes, planName: limits.planName },
    branchQuota: { used: branches, limit: limits.maxBranches, planName: limits.planName },
  };
}

const SUMMARY_FILTERS: QrStatusFilter[] = ['all', 'active', 'paused', 'expiring', 'expired', 'revoked', 'archived'];

export async function loadQrSummary(dealerId: string, now = new Date()): Promise<QrSummaryDto> {
  const days30 = lastIstanbulDays(30, now);
  const since30 = istanbulDayStart(days30[0]);
  const series14 = days30.slice(-14);
  const [counts, quotas, scanRows, feedbacks30, lowGroups, businessName] = await Promise.all([
    Promise.all(
      SUMMARY_FILTERS.map((s) =>
        prisma.qRCode.count({ where: { AND: [{ dealerId }, statusWhere(s, now) as Prisma.QRCodeWhereInput] } })
      )
    ),
    loadQrQuota(dealerId),
    scansByQrDay(dealerId, since30, null),
    prisma.feedback.count({ where: { qrCode: { dealerId }, deletedAt: null, createdAt: { gte: since30 } } }),
    prisma.feedback.groupBy({
      by: ['qrCodeId'],
      where: { qrCode: { dealerId, archivedAt: null }, deletedAt: null, createdAt: { gte: since30 } },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    businessNameOf(dealerId),
  ]);
  const byDay = new Map<string, number>();
  let scans30 = 0;
  for (const r of scanRows) {
    scans30 += r.n;
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.n);
  }
  const scanSeries = series14.map((d) => byDay.get(d) ?? 0);
  const scans7 = scanSeries.slice(7).reduce((a, b) => a + b, 0);
  const scansPrev7 = scanSeries.slice(0, 7).reduce((a, b) => a + b, 0);

  let lowest: QrSummaryDto['lowest'] = null;
  const candidates = lowGroups
    .filter((g) => g._count._all >= 3 && g._avg.rating != null)
    .sort((a, b) => (a._avg.rating as number) - (b._avg.rating as number));
  if (candidates[0]) {
    const qr = await prisma.qRCode.findFirst({ where: { id: candidates[0].qrCodeId, dealerId }, select: { id: true, name: true } });
    if (qr) {
      lowest = {
        id: qr.id,
        name: qr.name,
        avgRating: Math.round((candidates[0]._avg.rating as number) * 10) / 10,
        feedbacks: candidates[0]._count._all,
      };
    }
  }

  const c = Object.fromEntries(SUMMARY_FILTERS.map((s, i) => [s, counts[i]])) as QrSummaryDto['counts'];
  return {
    counts: c,
    quota: quotas.quota,
    branchQuota: quotas.branchQuota,
    scans7,
    scansPrev7,
    scanSeries,
    scans30,
    feedbacks30,
    conversion30: conversionPct(feedbacks30, scans30),
    lowest,
    businessName,
    generatedAt: now.toISOString(),
  };
}

// ───────────────────────────── Detay ─────────────────────────────

async function rotationLinks(dealerId: string, id: string) {
  // Rotate geçmişi şemada ilişki olarak tutulmuyor; `qr_code_rotated` olayından okunur.
  const rows = await prisma.$queryRaw<Array<{ old_id: string | null; new_id: string | null }>>(Prisma.sql`
    WITH RECURSIVE chain(old_id, new_id, depth) AS (
      SELECT e."data"->>'oldQrCodeId', e."data"->>'newQrCodeId', 1
        FROM "AnalyticsEvent" e
       WHERE e."event" = 'qr_code_rotated' AND e."data"->>'newQrCodeId' = ${id}
      UNION
      SELECT e."data"->>'oldQrCodeId', e."data"->>'newQrCodeId', c.depth + 1
        FROM "AnalyticsEvent" e JOIN chain c ON e."data"->>'newQrCodeId' = c.old_id
       WHERE e."event" = 'qr_code_rotated' AND c.depth < 12
    )
    SELECT old_id, new_id FROM chain
    UNION ALL
    SELECT NULL AS old_id, e."data"->>'newQrCodeId' AS new_id
      FROM "AnalyticsEvent" e
     WHERE e."event" = 'qr_code_rotated' AND e."data"->>'oldQrCodeId' = ${id}`);
  const predecessorIds = rows.filter((r) => r.old_id).map((r) => r.old_id as string);
  const successorId = rows.find((r) => !r.old_id && r.new_id)?.new_id ?? null;
  const ids = Array.from(new Set([...predecessorIds, ...(successorId ? [successorId] : [])]));
  if (ids.length === 0) return { predecessors: [] as QrHistoryEntry[], successor: null };
  const qrs = await prisma.qRCode.findMany({
    where: { id: { in: ids }, dealerId },
    select: {
      id: true,
      code: true,
      name: true,
      revokedAt: true,
      createdAt: true,
      _count: { select: { feedbacks: { where: { deletedAt: null } } } },
    },
  });
  const byId = new Map(qrs.map((q) => [q.id, q]));
  const predecessors: QrHistoryEntry[] = [];
  for (const pid of predecessorIds) {
    const q = byId.get(pid);
    if (!q) continue;
    predecessors.push({
      id: q.id,
      code: q.code,
      revokedAt: q.revokedAt?.toISOString() ?? null,
      createdAt: q.createdAt.toISOString(),
      feedbackTotal: q._count.feedbacks,
    });
  }
  predecessors.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const s = successorId ? byId.get(successorId) : null;
  return { predecessors, successor: s ? { id: s.id, code: s.code, name: s.name } : null };
}

export async function loadQrDetail(dealerId: string, id: string, now = new Date()): Promise<QrDetailDto | null> {
  const row = await prisma.qRCode.findFirst({ where: { id, dealerId }, select: QR_SELECT });
  if (!row) return null;
  const days = lastIstanbulDays(QR_STATS_DAYS, now);
  const since = istanbulDayStart(days[0]);
  const [stats, scanRows, fbRows, segRows, history, businessName] = await Promise.all([
    statsFor(dealerId, [id], now),
    scansByQrDay(dealerId, since, [id]),
    prisma.$queryRaw<Array<{ day: string; n: unknown }>>(Prisma.sql`
      SELECT ${IST_DAY(Prisma.sql`f."createdAt"`)} AS day, COUNT(*)::bigint AS n
        FROM "Feedback" f
       WHERE f."qrCodeId" = ${id} AND f."deletedAt" IS NULL AND f."createdAt" >= ${since}
       GROUP BY 1`),
    prisma.$queryRaw<Array<{ segment: string | null; n: unknown }>>(Prisma.sql`
      SELECT NULLIF(e."data"->>'segment', '') AS segment, COUNT(*)::bigint AS n
        FROM "AnalyticsEvent" e
       WHERE e."event" = 'qr_scanned' AND e."createdAt" >= ${since}
         AND e."data"->>'dealerId' = ${dealerId} AND e."data"->>'qrCodeId' = ${id}
       GROUP BY 1 ORDER BY 2 DESC LIMIT 20`),
    rotationLinks(dealerId, id),
    businessNameOf(dealerId),
  ]);
  const scanByDay = new Map(scanRows.map((r) => [r.day, r.n]));
  const fbByDay = new Map(fbRows.map((r) => [r.day, toNum(r.n)]));
  return {
    item: toItem(row, stats.get(id) ?? emptyStats(), now),
    links: linksFromSegmentConfig(row.segmentConfig),
    daily: days.map((d) => ({ day: d, scans: scanByDay.get(d) ?? 0, feedbacks: fbByDay.get(d) ?? 0 })),
    bySegment: segRows.map((r) => ({ segment: r.segment, scans: toNum(r.n) })),
    predecessors: history.predecessors,
    successor: history.successor,
    businessName,
    generatedAt: now.toISOString(),
  };
}

// ───────────────────────────── Şubeler ─────────────────────────────

export async function loadLocations(dealerId: string, now = new Date()): Promise<LocationsDto> {
  const since = istanbulDayStart(lastIstanbulDays(30, now)[0]);
  const [rows, quotas, fb] = await Promise.all([
    prisma.dealerLocation.findMany({
      where: { dealerId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        address: true,
        isActive: true,
        createdAt: true,
        _count: { select: { qrCodes: { where: { revokedAt: null, archivedAt: null } } } },
      },
    }),
    loadQrQuota(dealerId),
    prisma.$queryRaw<Array<{ location_id: string; n: unknown }>>(Prisma.sql`
      SELECT q."locationId" AS location_id, COUNT(*)::bigint AS n
        FROM "Feedback" f JOIN "QRCode" q ON q."id" = f."qrCodeId"
       WHERE q."dealerId" = ${dealerId} AND q."locationId" IS NOT NULL
         AND f."deletedAt" IS NULL AND f."createdAt" >= ${since}
       GROUP BY 1`),
  ]);
  const fbMap = new Map(fb.map((r) => [r.location_id, toNum(r.n)]));
  const items: LocationDto[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    liveQrCount: r._count.qrCodes,
    feedbacks30: fbMap.get(r.id) ?? 0,
  }));
  return { items, quota: quotas.branchQuota };
}
