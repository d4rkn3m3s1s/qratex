/**
 * Kampanya listesi (sekmeli, aranabilir, sayfalı) + 30 günlük özet şeridi.
 * Açılma sayıları: kampanyanın uygulama içi bildirimleri (`data.campaignId`) ve okunma anı.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  LIST_PAGE_SIZE,
  TAB_STATUSES,
  LIST_TABS,
  pct,
  wasSent,
  type CampaignSegmentKey,
  type ListTab,
} from '../domain';
import type { CampaignListItem, CampaignListResult, CampaignSummary } from '../types';
import { toCampaignDto } from './common';
import { readLastFailures } from './snapshot';

const DAY_MS = 86_400_000;
/** Bildirim `createdAt` (DB saati) ile `sentAt` (uygulama saati) arasındaki kayma payı. */
const CLOCK_SLACK_MS = 60 * 60 * 1000;

export interface ListParams {
  tab: ListTab;
  q?: string | null;
  segment?: CampaignSegmentKey | null;
  page?: number;
  pageSize?: number;
}

type OpenRow = { cid: string; delivered: number; opened: number };

/** Kampanya başına uygulama içi teslim ve açılma sayıları (tek sorgu). */
export async function openCounts(campaigns: ReadonlyArray<{ id: string; sentAt: Date | null }>): Promise<Map<string, { delivered: number; opened: number }>> {
  const out = new Map<string, { delivered: number; opened: number }>();
  const sent = campaigns.filter((c) => c.sentAt);
  if (sent.length === 0) return out;
  const since = new Date(Math.min(...sent.map((c) => c.sentAt!.getTime())) - CLOCK_SLACK_MS);
  const rows = await prisma.$queryRaw<OpenRow[]>(Prisma.sql`
    SELECT n."data"->>'campaignId' AS cid,
           COUNT(*)::int AS delivered,
           COUNT(n."readAt")::int AS opened
    FROM "Notification" n
    WHERE n."type" = 'campaign'
      AND n."createdAt" >= ${since}
      AND n."data"->>'campaignId' IN (${Prisma.join(sent.map((c) => c.id))})
    GROUP BY 1
  `);
  for (const r of rows) out.set(r.cid, { delivered: Number(r.delivered) || 0, opened: Number(r.opened) || 0 });
  return out;
}

function orderFor(tab: ListTab): Prisma.CampaignOrderByWithRelationInput[] {
  if (tab === 'scheduled') return [{ sentAt: 'asc' }, { id: 'asc' }];
  if (tab === 'sent' || tab === 'archived') return [{ sentAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
  return [{ updatedAt: 'desc' }, { id: 'desc' }];
}

export async function listCampaigns(dealerId: string, params: ListParams): Promise<CampaignListResult> {
  const pageSize = Math.min(Math.max(params.pageSize ?? LIST_PAGE_SIZE, 1), 50);
  const q = params.q?.trim().slice(0, 100) || null;
  const where: Prisma.CampaignWhereInput = {
    dealerId,
    status: { in: [...TAB_STATUSES[params.tab]] },
    ...(params.segment ? { targetSegment: params.segment } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { message: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, grouped] = await Promise.all([
    prisma.campaign.count({ where }),
    prisma.campaign.groupBy({ by: ['status'], where: { dealerId }, _count: { _all: true } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(params.page ?? 1)), pageCount);

  const rows = await prisma.campaign.findMany({
    where,
    orderBy: orderFor(params.tab),
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const [opens, failures] = await Promise.all([
    openCounts(rows.filter((r) => wasSent(r))),
    readLastFailures(rows.filter((r) => r.status === 'failed').map((r) => r.id)),
  ]);

  const items: CampaignListItem[] = rows.map((r) => {
    const sent = wasSent(r);
    const o = opens.get(r.id);
    return {
      ...toCampaignDto(r),
      inAppDelivered: sent ? (o?.delivered ?? 0) : null,
      opened: sent ? (o?.opened ?? 0) : null,
      failureReason: failures.get(r.id) ?? null,
    };
  });

  const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
  const counts = Object.fromEntries(
    LIST_TABS.map((tab) => [tab, TAB_STATUSES[tab].reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0)])
  ) as Record<ListTab, number>;

  return { tab: params.tab, items, total, page, pageSize, pageCount, counts };
}

export async function campaignSummary(dealerId: string, now: Date = new Date()): Promise<CampaignSummary> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [recent, nextScheduled, scheduledCount, drafts] = await Promise.all([
    prisma.campaign.findMany({
      where: { dealerId, status: { in: ['sent', 'archived'] }, sentAt: { gte: since } },
      select: { id: true, sentAt: true, sentCount: true },
    }),
    prisma.campaign.findFirst({
      where: { dealerId, status: 'scheduled' },
      orderBy: { sentAt: 'asc' },
      select: { sentAt: true },
    }),
    prisma.campaign.count({ where: { dealerId, status: 'scheduled' } }),
    prisma.campaign.count({ where: { dealerId, status: { in: ['draft', 'failed'] } } }),
  ]);
  const opens = await openCounts(recent);
  let delivered = 0;
  let opened = 0;
  for (const v of opens.values()) {
    delivered += v.delivered;
    opened += v.opened;
  }
  return {
    sentCampaigns: recent.length,
    reached: recent.reduce((s, c) => s + c.sentCount, 0),
    inAppDelivered: delivered,
    opened,
    openRate: pct(opened, delivered),
    scheduledUpcoming: scheduledCount,
    nextScheduledAt: nextScheduled?.sentAt ? nextScheduled.sentAt.toISOString() : null,
    drafts,
  };
}
