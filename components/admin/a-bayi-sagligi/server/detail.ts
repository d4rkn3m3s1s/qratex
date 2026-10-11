/**
 * Bayi Sağlığı detay çekmecesi — tek bayi: skor dökümü + öneriler + haftalık trend + son düşük
 * puanlı yorumlar + açık olaylar + telafi kuyruğu + CSM görevleri + playbook geçmişi.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { getPlaybookById } from '@/lib/growth-playbooks';
import type { HealthRow, HealthWindow } from '../domain';
import { normalizeCsmStatus } from '../domain';
import { loadAllRows } from './list';

const DAY_MS = 86_400_000;
export const TREND_WEEKS = 12;
const TZ = 'Europe/Istanbul';

export interface WeekPoint {
  week: string;
  activity: number;
  avgRating: number | null;
  reviews: number;
}

export interface DealerHealthDetail {
  row: HealthRow;
  window: HealthWindow;
  computedAt: string;
  platformMean: number;
  dealer: { createdAt: string; businessCategory: string | null; subscriptionStatus: string | null };
  trend: WeekPoint[];
  lowReviews: Array<{ id: string; channel: 'qr' | 'consumption'; rating: number; text: string | null; createdAt: string; replied: boolean }>;
  incidents: Array<{ id: string; title: string; severity: string; status: string; createdAt: string; dueAt: string | null }>;
  remedies: Array<{ id: string; createdAt: string; message: string }>;
  csmTasks: Array<{
    id: string;
    type: string;
    status: 'open' | 'in_progress' | 'resolved';
    priority: string;
    healthScore: number | null;
    note: string | null;
    assignedToName: string | null;
    dueAt: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }>;
  playbookCampaigns: Array<{
    id: string;
    playbookId: string;
    playbookTitle: string | null;
    title: string;
    status: string;
    createdAt: string;
    sentAt: string | null;
    sentCount: number;
  }>;
}

/** İstanbul takvimine göre haftanın (Pazartesi) başlangıç günü, YYYY-MM-DD. */
export function istanbulWeekKey(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  const dayIdx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  const utc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) - Math.max(0, dayIdx) * DAY_MS;
  return new Date(utc).toISOString().slice(0, 10);
}

export function lastWeekKeys(now: Date, weeks = TREND_WEEKS): string[] {
  const keys: string[] = [];
  const current = istanbulWeekKey(now);
  const base = Date.parse(`${current}T00:00:00Z`);
  for (let i = weeks - 1; i >= 0; i -= 1) keys.push(new Date(base - i * 7 * DAY_MS).toISOString().slice(0, 10));
  return keys;
}

type WeekRow = { week: string; n: bigint | number; rating_sum: bigint | number | null };

function noteFromMetadata(meta: unknown): string | null {
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const n = (meta as Record<string, unknown>).note;
    if (typeof n === 'string' && n.trim()) return n;
  }
  return null;
}

export async function getDealerHealthDetail(dealerId: string, window: HealthWindow, now: Date = new Date()): Promise<DealerHealthDetail> {
  const dealer = await prisma.user.findFirst({
    where: { id: dealerId, role: 'DEALER' },
    select: { id: true, createdAt: true, businessCategory: true, subscriptionStatus: true },
  });
  if (!dealer) throw new ApiError('NOT_FOUND', 'Bayi bulunamadı.');

  const { rows, computedAt, platformMean } = await loadAllRows(window);
  const row = rows.find((r) => r.dealerId === dealerId);
  if (!row) throw new ApiError('NOT_FOUND', 'Bayi bulunamadı.');

  const since = new Date(now.getTime() - window * DAY_MS);
  const keys = lastWeekKeys(now);
  const trendSince = new Date(Date.parse(`${keys[0]}T00:00:00Z`) - DAY_MS);
  const weekExpr = (col: Prisma.Sql) =>
    Prisma.sql`to_char(date_trunc('week', (${col} AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}), 'YYYY-MM-DD')`;

  const [consWeeks, fbWeeks, crWeeks, lowFb, lowCr, incidents, remedies, tasks, campaigns] = await Promise.all([
    prisma.$queryRaw<WeekRow[]>(Prisma.sql`
      SELECT ${weekExpr(Prisma.sql`"createdAt"`)} AS week, COUNT(*) AS n, NULL::bigint AS rating_sum
      FROM "Consumption" WHERE "dealerId" = ${dealerId} AND "createdAt" >= ${trendSince}
      GROUP BY 1`),
    prisma.$queryRaw<WeekRow[]>(Prisma.sql`
      SELECT ${weekExpr(Prisma.sql`f."createdAt"`)} AS week, COUNT(*) AS n, SUM(f."rating") AS rating_sum
      FROM "Feedback" f JOIN "QRCode" q ON q."id" = f."qrCodeId"
      WHERE q."dealerId" = ${dealerId} AND f."deletedAt" IS NULL AND f."createdAt" >= ${trendSince}
      GROUP BY 1`),
    prisma.$queryRaw<WeekRow[]>(Prisma.sql`
      SELECT ${weekExpr(Prisma.sql`r."createdAt"`)} AS week, COUNT(*) AS n, SUM(r."rating") AS rating_sum
      FROM "ConsumptionReview" r JOIN "Consumption" c ON c."id" = r."consumptionId"
      WHERE c."dealerId" = ${dealerId} AND r."deletedAt" IS NULL AND r."createdAt" >= ${trendSince}
      GROUP BY 1`),
    prisma.feedback.findMany({
      where: { qrCode: { dealerId }, deletedAt: null, rating: { lte: 2 }, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, rating: true, text: true, createdAt: true, dealerRepliedAt: true },
    }),
    prisma.consumptionReview.findMany({
      where: { consumption: { dealerId }, deletedAt: null, rating: { lte: 2 }, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, rating: true, text: true, createdAt: true, dealerRepliedAt: true },
    }),
    prisma.incident.findMany({
      where: { dealerId, status: { in: ['open', 'assigned', 'in_progress'] } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, title: true, severity: true, status: true, createdAt: true, dueAt: true },
    }),
    prisma.remedyOffer.findMany({
      where: { dealerId, status: 'awaiting_dealer_approval' },
      orderBy: { createdAt: 'asc' },
      take: 5,
      select: { id: true, createdAt: true, message: true },
    }),
    prisma.cSMTask.findMany({
      where: { dealerId },
      orderBy: [{ createdAt: 'desc' }],
      take: 20,
      select: {
        id: true,
        type: true,
        status: true,
        priority: true,
        healthScore: true,
        metadata: true,
        dueAt: true,
        createdAt: true,
        resolvedAt: true,
        assignedTo: { select: { name: true, email: true } },
      },
    }),
    prisma.campaign.findMany({
      where: { dealerId, playbookSourceId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, playbookSourceId: true, title: true, status: true, createdAt: true, sentAt: true, sentCount: true },
    }),
  ]);

  const byWeek = new Map(keys.map((k) => [k, { activity: 0, reviews: 0, ratingSum: 0 }]));
  for (const r of consWeeks) {
    const e = byWeek.get(r.week);
    if (e) e.activity += Number(r.n);
  }
  for (const r of [...fbWeeks, ...crWeeks]) {
    const e = byWeek.get(r.week);
    if (!e) continue;
    e.activity += Number(r.n);
    e.reviews += Number(r.n);
    e.ratingSum += Number(r.rating_sum ?? 0);
  }

  const lowReviews = [
    ...lowFb.map((f) => ({ id: f.id, channel: 'qr' as const, rating: f.rating, text: f.text, createdAt: f.createdAt, replied: f.dealerRepliedAt != null })),
    ...lowCr.map((r) => ({ id: r.id, channel: 'consumption' as const, rating: r.rating, text: r.text, createdAt: r.createdAt, replied: r.dealerRepliedAt != null })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map((r) => ({ ...r, text: r.text ? r.text.slice(0, 280) : null, createdAt: r.createdAt.toISOString() }));

  // Açık görevler önce, sonra en yeni.
  const statusRank = { open: 0, in_progress: 0, resolved: 1 } as const;
  const csmTasks = tasks
    .map((t) => ({
      id: t.id,
      type: t.type,
      status: normalizeCsmStatus(t.status),
      priority: t.priority,
      healthScore: t.healthScore == null ? null : Math.round(t.healthScore),
      note: noteFromMetadata(t.metadata),
      assignedToName: t.assignedTo?.name || t.assignedTo?.email || null,
      dueAt: t.dueAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
    }))
    .sort((a, b) => statusRank[a.status] - statusRank[b.status] || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);

  return {
    row,
    window,
    computedAt,
    platformMean,
    dealer: {
      createdAt: dealer.createdAt.toISOString(),
      businessCategory: dealer.businessCategory ?? null,
      subscriptionStatus: dealer.subscriptionStatus ?? null,
    },
    trend: keys.map((k) => {
      const e = byWeek.get(k)!;
      return { week: k, activity: e.activity, reviews: e.reviews, avgRating: e.reviews > 0 ? Math.round((e.ratingSum / e.reviews) * 100) / 100 : null };
    }),
    lowReviews,
    incidents: incidents.map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      status: i.status,
      createdAt: i.createdAt.toISOString(),
      dueAt: i.dueAt?.toISOString() ?? null,
    })),
    remedies: remedies.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), message: r.message.slice(0, 200) })),
    csmTasks,
    playbookCampaigns: campaigns.map((c) => ({
      id: c.id,
      playbookId: c.playbookSourceId ?? '',
      playbookTitle: c.playbookSourceId ? (getPlaybookById(c.playbookSourceId)?.title ?? null) : null,
      title: c.title,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      sentAt: c.sentAt?.toISOString() ?? null,
      sentCount: c.sentCount,
    })),
  };
}
