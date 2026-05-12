/**
 * Action completion rate KPI (P1 item 2).
 * Insight veriyorsun kaç tanesi aksiyona dönüşüyor.
 */
import { prisma } from '@/lib/prisma';

export type ActionCompletionPeriod = '7d' | '30d' | '90d';

function getPeriodDates(period: ActionCompletionPeriod): { start: Date } {
  const now = new Date();
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start };
}

export interface ActionCompletionResult {
  total: number;
  done: number;
  rate: number;
  period: string;
}

export async function getActionCompletionRate(
  dealerId: string,
  period: ActionCompletionPeriod = '30d'
): Promise<ActionCompletionResult> {
  const { start } = getPeriodDates(period);

  const [total, done] = await Promise.all([
    prisma.actionItem.count({
      where: { dealerId, createdAt: { gte: start } },
    }),
    prisma.actionItem.count({
      where: { dealerId, status: 'done', createdAt: { gte: start } },
    }),
  ]);

  const rate = total > 0 ? (done / total) * 100 : 0;
  return {
    total,
    done,
    rate: Math.round(rate * 10) / 10,
    period,
  };
}

export async function getActionCompletionAggregate(
  period: ActionCompletionPeriod = '30d'
): Promise<{ dealers: { dealerId: string; dealerName: string | null; total: number; done: number; rate: number }[]; averageRate: number }> {
  const { start } = getPeriodDates(period);

  const items = await prisma.actionItem.findMany({
    where: { createdAt: { gte: start } },
    select: {
      dealerId: true,
      dealer: { select: { businessName: true, name: true } },
      status: true,
    },
  });

  const byDealer = new Map<string, { total: number; done: number; name: string | null }>();
  for (const i of items) {
    const cur = byDealer.get(i.dealerId) ?? { total: 0, done: 0, name: i.dealer.businessName || i.dealer.name };
    cur.total++;
    if (i.status === 'done') cur.done++;
    cur.name = cur.name || i.dealer.businessName || i.dealer.name;
    byDealer.set(i.dealerId, cur);
  }

  const dealers = Array.from(byDealer.entries()).map(([dealerId, v]) => ({
    dealerId,
    dealerName: v.name,
    total: v.total,
    done: v.done,
    rate: v.total > 0 ? Math.round((v.done / v.total) * 1000) / 10 : 0,
  }));

  const totalDone = dealers.reduce((s, d) => s + d.done, 0);
  const totalAll = dealers.reduce((s, d) => s + d.total, 0);
  const averageRate = totalAll > 0 ? Math.round((totalDone / totalAll) * 1000) / 10 : 0;

  return { dealers, averageRate };
}
