import { prisma } from '@/lib/prisma';

export type HealthV2Breakdown = {
  remedyQueue: number;
  remedyStale: number;
  tableConcernRatio: number;
  tableResolvedRatio: number | null;
  repeatVisitorRatio: number | null;
  score: number;
};

const SLA_H = 48;

/**
 * 0–100 sağlık skoru: telafi SLA, masa CONCERN oranı / kapanış, tekrar ziyaret.
 */
export async function computeDealerHealthV2(dealerId: string): Promise<HealthV2Breakdown> {
  const now = new Date();
  const slaCut = new Date(now.getTime() - SLA_H * 3600 * 1000);
  const since7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const since14 = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const since30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  const [queue, stale, pulses14, remedies30, fb30] = await Promise.all([
    prisma.remedyOffer.count({
      where: { dealerId, status: 'awaiting_dealer_approval' },
    }),
    prisma.remedyOffer.count({
      where: {
        dealerId,
        status: { in: ['pending', 'awaiting_dealer_approval'] },
        createdAt: { lt: slaCut },
      },
    }),
    prisma.tablePulse.findMany({
      where: { dealerId, createdAt: { gte: since14 } },
      select: { mood: true, resolvedAt: true },
    }),
    prisma.remedyOffer.findMany({
      where: { dealerId, createdAt: { gte: since30 } },
      select: { userId: true },
    }),
    prisma.feedback.findMany({
      where: { qrCode: { dealerId }, createdAt: { gte: since30 }, userId: { not: null } },
      select: { userId: true },
    }),
  ]);

  const concerns = pulses14.filter((p) => p.mood === 'CONCERN').length;
  const resolvedConcerns = pulses14.filter((p) => p.mood === 'CONCERN' && p.resolvedAt).length;
  const totalPulse = pulses14.length || 1;
  const tableConcernRatio = pulses14.length ? concerns / pulses14.length : 0;
  const tableResolvedRatio =
    concerns > 0 ? resolvedConcerns / concerns : null;

  const userFb = new Map<string, number>();
  for (const f of fb30) {
    if (f.userId) userFb.set(f.userId, (userFb.get(f.userId) || 0) + 1);
  }
  const repeatFb = [...userFb.values()].filter((n) => n >= 2).length;
  const visitorsFb = userFb.size || 1;
  const repeatVisitorRatio = repeatFb / visitorsFb;

  let score = 100;
  score -= Math.min(25, queue * 5);
  score -= Math.min(20, stale * 4);
  score -= Math.min(25, tableConcernRatio * 80);
  if (tableResolvedRatio != null && concerns > 0) {
    score += Math.round(tableResolvedRatio * 15);
  }
  score += Math.round(Math.min(0.35, repeatVisitorRatio) * 40);

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    remedyQueue: queue,
    remedyStale: stale,
    tableConcernRatio: Math.round(tableConcernRatio * 100) / 100,
    tableResolvedRatio:
      tableResolvedRatio != null ? Math.round(tableResolvedRatio * 100) / 100 : null,
    repeatVisitorRatio: Math.round(repeatVisitorRatio * 100) / 100,
    score,
  };
}
