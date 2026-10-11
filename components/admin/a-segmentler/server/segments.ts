/**
 * Segment kayıt defteri — sunucu okuyucuları. Kaynak: `CustomerSegment` + CLV cron'unun yazdığı
 * `CustomerLifetimeValue.segmentId`. Sayımlar veritabanında (`groupBy`) yapılır: kesilme yok,
 * bellekte 10.000 satır yok. Anonimleşmiş/demo hesaplar hariç; gölge yasaklılar paya girmez,
 * ayrıca sayılır (rapor B1/B2/B5).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cachedJson, redisSetJson } from '@/lib/redis';
import { ApiError } from '@/lib/http/define-route';
import { toCsv } from '@/lib/dealer-analytics/csv';
import {
  EXPORT_ROW_CAP,
  defaultMemberSort,
  isVirtualSegment,
  largestRemainderPercents,
  orderSegments,
  segmentKeyForName,
  type MemberSortKey,
  type SegmentMember,
  type SegmentMembersPage,
  type SegmentOverview,
  type SegmentSummary,
} from '../domain';

const OVERVIEW_CACHE_KEY = 'admin:segments:overview:v2';
const OVERVIEW_TTL = 300;

/** Paya giren müşteri tanımı (tek yer). */
export const ELIGIBLE_CUSTOMER: Prisma.UserWhereInput = {
  role: 'CUSTOMER',
  anonymizedAt: null,
  isDemo: false,
  fraudStatus: { not: 'shadow_ban' },
};

async function computeOverview(): Promise<SegmentOverview> {
  const [registry, customers, suspicious, grouped, maxCalc, pendingProposals] = await Promise.all([
    prisma.customerSegment.findMany({
      select: { id: true, name: true, description: true, color: true, isActive: true },
    }),
    prisma.user.count({ where: ELIGIBLE_CUSTOMER }),
    prisma.user.count({ where: { role: 'CUSTOMER', anonymizedAt: null, isDemo: false, fraudStatus: 'shadow_ban' } }),
    prisma.customerLifetimeValue.groupBy({
      by: ['segmentId'],
      where: { user: ELIGIBLE_CUSTOMER },
      _count: { _all: true },
      _avg: { totalSpent: true, predictedChurn: true },
    }),
    prisma.customerLifetimeValue.aggregate({ _max: { calculatedAt: true } }),
    prisma.segmentCampaignProposal.count({ where: { status: 'PENDING' } }),
  ]);

  const bySegment = new Map<string | null, { count: number; avgSpent: number | null; avgChurn: number | null }>();
  let withClv = 0;
  for (const g of grouped) {
    const count = g._count?._all ?? 0;
    withClv += count;
    bySegment.set(g.segmentId ?? null, {
      count,
      avgSpent: g._avg?.totalSpent ?? null,
      avgChurn: g._avg?.predictedChurn ?? null,
    });
  }
  const unsegmented = bySegment.get(null)?.count ?? 0;
  const uncomputed = Math.max(0, customers - withClv);

  const base: Omit<SegmentSummary, 'share'>[] = registry.map((s) => {
    const agg = bySegment.get(s.id);
    return {
      id: s.id,
      key: segmentKeyForName(s.name),
      name: s.name,
      description: s.description,
      color: s.color,
      isActive: s.isActive,
      count: agg?.count ?? 0,
      avgSpent: agg?.avgSpent ?? null,
      avgChurn: agg?.avgChurn ?? null,
    };
  });
  base.push(
    { id: 'none', key: 'none', name: 'none', description: null, color: null, isActive: true, count: unsegmented, avgSpent: bySegment.get(null)?.avgSpent ?? null, avgChurn: bySegment.get(null)?.avgChurn ?? null },
    { id: 'uncomputed', key: 'uncomputed', name: 'uncomputed', description: null, color: null, isActive: true, count: uncomputed, avgSpent: null, avgChurn: null }
  );
  const ordered = orderSegments(base);
  const shares = largestRemainderPercents(ordered.map((s) => s.count));

  return {
    computedAt: new Date().toISOString(),
    clvComputedAt: maxCalc._max?.calculatedAt ? maxCalc._max.calculatedAt.toISOString() : null,
    totals: { customers, withClv, uncomputed, unsegmented, excludedSuspicious: suspicious },
    segments: ordered.map((s, i) => ({ ...s, share: shares[i] ?? 0 })),
    pendingProposals,
  };
}

/** 5 dk önbellekli genel bakış; `fresh` önbelleği atlar ve tazeler. */
export async function getSegmentOverview(opts: { fresh?: boolean } = {}): Promise<SegmentOverview> {
  if (opts.fresh) {
    const data = await computeOverview();
    await redisSetJson(OVERVIEW_CACHE_KEY, data, OVERVIEW_TTL).catch(() => undefined);
    return data;
  }
  return cachedJson(OVERVIEW_CACHE_KEY, OVERVIEW_TTL, computeOverview);
}

// ───────────────────────────── Üyeler ─────────────────────────────

export interface MembersQuery {
  segmentId: string;
  q?: string | null;
  sort?: { id: MemberSortKey; desc: boolean } | null;
  page: number;
  size: number;
}

async function resolveSegment(segmentId: string): Promise<{ id: string; name: string; key: string | null }> {
  if (isVirtualSegment(segmentId)) return { id: segmentId, name: segmentId, key: segmentId };
  const seg = await prisma.customerSegment.findUnique({ where: { id: segmentId }, select: { id: true, name: true } });
  if (!seg) throw new ApiError('NOT_FOUND', 'Segment bulunamadı.');
  return { id: seg.id, name: seg.name, key: segmentKeyForName(seg.name) };
}

function userSearch(q: string | null | undefined): Prisma.UserWhereInput {
  const term = (q ?? '').trim().slice(0, 100);
  if (!term) return {};
  return {
    OR: [
      { name: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
    ],
  };
}

function clvOrder(sort: { id: MemberSortKey; desc: boolean }): Prisma.CustomerLifetimeValueOrderByWithRelationInput[] {
  const dir: Prisma.SortOrder = sort.desc ? 'desc' : 'asc';
  const nulls = { sort: dir, nulls: 'last' as const };
  switch (sort.id) {
    case 'visits':
      return [{ totalVisits: dir }, { userId: 'asc' }];
    case 'last':
      return [{ lastPurchaseAt: nulls }, { userId: 'asc' }];
    case 'churn':
      return [{ predictedChurn: nulls }, { userId: 'asc' }];
    case 'name':
      return [{ user: { name: dir } }, { userId: 'asc' }];
    default:
      return [{ totalSpent: dir }, { userId: 'asc' }];
  }
}

const USER_SELECT = { id: true, name: true, email: true, level: true, points: true, fraudStatus: true } as const;

async function queryMembers(q: MembersQuery, take: number, skip: number) {
  const segment = await resolveSegment(q.segmentId);
  const sort = q.sort ?? defaultMemberSort(segment.key);

  if (segment.id === 'uncomputed') {
    // CLV kaydı olmayan müşteriler: harcama alanları yok (null), yalnız kimlik + seviye.
    const where: Prisma.UserWhereInput = { AND: [ELIGIBLE_CUSTOMER, { customerCLV: { is: null } }, userSearch(q.q)] };
    const dir: Prisma.SortOrder = sort.desc ? 'desc' : 'asc';
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: { ...USER_SELECT, createdAt: true },
        orderBy: sort.id === 'name' ? [{ name: dir }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }],
        take,
        skip,
      }),
    ]);
    const items: SegmentMember[] = users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      totalSpent: null,
      totalVisits: null,
      avgOrderValue: null,
      lastPurchaseAt: null,
      predictedChurn: null,
      churnRisk: null,
      level: u.level,
      points: u.points,
      fraudStatus: u.fraudStatus,
    }));
    return { segment, sort: sort.id === 'name' ? sort : { id: 'name' as const, desc: false }, total, items };
  }

  const where: Prisma.CustomerLifetimeValueWhereInput = {
    segmentId: segment.id === 'none' ? null : segment.id,
    user: { AND: [ELIGIBLE_CUSTOMER, userSearch(q.q)] },
  };
  const [total, rows] = await Promise.all([
    prisma.customerLifetimeValue.count({ where }),
    prisma.customerLifetimeValue.findMany({
      where,
      select: {
        totalSpent: true,
        totalVisits: true,
        avgOrderValue: true,
        lastPurchaseAt: true,
        predictedChurn: true,
        churnRisk: true,
        user: { select: USER_SELECT },
      },
      orderBy: clvOrder(sort),
      take,
      skip,
    }),
  ]);
  const items: SegmentMember[] = rows.map((r) => ({
    userId: r.user.id,
    name: r.user.name,
    email: r.user.email,
    totalSpent: r.totalSpent,
    totalVisits: r.totalVisits,
    avgOrderValue: r.avgOrderValue,
    lastPurchaseAt: r.lastPurchaseAt ? r.lastPurchaseAt.toISOString() : null,
    predictedChurn: r.predictedChurn,
    churnRisk: r.churnRisk,
    level: r.user.level,
    points: r.user.points,
    fraudStatus: r.user.fraudStatus,
  }));
  return { segment, sort, total, items };
}

export async function getSegmentMembers(q: MembersQuery): Promise<SegmentMembersPage> {
  const res = await queryMembers(q, q.size, (q.page - 1) * q.size);
  return { segment: res.segment, items: res.items, total: res.total, page: q.page, size: q.size, sort: res.sort };
}

/** Sunucu CSV (formül enjeksiyonu korumalı `toCsv`), en fazla EXPORT_ROW_CAP satır. */
export async function exportSegmentMembersCsv(
  q: Omit<MembersQuery, 'page' | 'size'>,
  header: readonly string[]
): Promise<{ csv: string; rows: number; truncated: boolean; segmentName: string }> {
  const res = await queryMembers({ ...q, page: 1, size: EXPORT_ROW_CAP }, EXPORT_ROW_CAP, 0);
  const csv = toCsv(
    header,
    res.items.map((m) => [
      m.name ?? '',
      m.email ?? '',
      m.totalSpent,
      m.totalVisits,
      m.avgOrderValue,
      m.lastPurchaseAt ? m.lastPurchaseAt.slice(0, 10) : '',
      m.predictedChurn,
      m.churnRisk ?? '',
      m.level,
      m.points,
      m.fraudStatus,
    ])
  );
  return { csv, rows: res.items.length, truncated: res.total > res.items.length, segmentName: res.segment.name };
}
