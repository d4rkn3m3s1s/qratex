import { prisma } from '@/lib/prisma';

export type DealerExperienceRow = {
  id: string;
  kind: 'feedback' | 'review';
  rating: number;
  label: string;
  createdAt: string;
};

function pickLabel(topics: unknown, text: string | null): string {
  if (Array.isArray(topics) && topics.length > 0) {
    const t = topics[0];
    if (typeof t === 'string') return t.slice(0, 24);
  }
  if (text) {
    const w = text
      .trim()
      .split(/\s+/)
      .find((x) => x.length > 2);
    if (w) return w.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 24);
  }
  return 'Deneyim';
}

export async function getRecentExperiencesAtDealer(
  userId: string,
  dealerId: string,
  take = 3
): Promise<DealerExperienceRow[]> {
  const [feedbacks, reviews] = await Promise.all([
    prisma.feedback.findMany({
      where: { userId, qrCode: { dealerId } },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, rating: true, topics: true, text: true, createdAt: true },
    }),
    prisma.consumptionReview.findMany({
      where: { customerId: userId, consumption: { dealerId } },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, rating: true, text: true, createdAt: true },
    }),
  ]);

  const merged: DealerExperienceRow[] = [
    ...feedbacks.map((f) => ({
      id: f.id,
      kind: 'feedback' as const,
      rating: f.rating,
      label: pickLabel(f.topics, f.text),
      createdAt: f.createdAt.toISOString(),
    })),
    ...reviews.map((r) => ({
      id: r.id,
      kind: 'review' as const,
      rating: r.rating,
      label: pickLabel(null, r.text),
      createdAt: r.createdAt.toISOString(),
    })),
  ];

  merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return merged.slice(0, take);
}

export async function countVisitsAtDealer(userId: string, dealerId: string): Promise<number> {
  const [fc, cc] = await Promise.all([
    prisma.feedback.count({ where: { userId, qrCode: { dealerId } } }),
    prisma.consumption.count({ where: { customerId: userId, dealerId } }),
  ]);
  return fc + cc;
}

export function loyaltyMilestones(visitCount: number): { level: string; nextAt: number | null } {
  const tiers = [
    { at: 3, label: '3. ziyaret' },
    { at: 5, label: '5. ziyaret — sadakat' },
    { at: 10, label: '10. ziyaret' },
    { at: 25, label: '25. ziyaret — içerde' },
  ];
  const achieved = [...tiers].reverse().find((t) => visitCount >= t.at);
  const next = tiers.find((t) => visitCount < t.at);
  return {
    level: achieved?.label ?? 'İlk adımlar',
    nextAt: next?.at ?? null,
  };
}
