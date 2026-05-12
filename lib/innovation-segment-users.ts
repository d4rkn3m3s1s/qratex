import { prisma } from '@/lib/prisma';

const RECENT_DAYS = 45;

function daysAgo(d: number): Date {
  const x = new Date();
  x.setDate(x.getDate() - d);
  return x;
}

/**
 * İnovasyon segment anahtarlarına göre müşteri kimlikleri (bildirim gönderimi için).
 */
export async function resolveInnovationSegmentUserIds(
  dealerId: string,
  segmentKey: string
): Promise<string[]> {
  const recentSince = daysAgo(RECENT_DAYS);

  const [allFb, allCons, recentFb, recentCons] = await Promise.all([
    prisma.feedback.findMany({
      where: { qrCode: { dealerId }, userId: { not: null } },
      select: { userId: true },
    }),
    prisma.consumption.findMany({
      where: { dealerId },
      select: { customerId: true },
    }),
    prisma.feedback.findMany({
      where: {
        qrCode: { dealerId },
        userId: { not: null },
        createdAt: { gte: recentSince },
      },
      select: { userId: true },
    }),
    prisma.consumption.findMany({
      where: { dealerId, createdAt: { gte: recentSince } },
      select: { customerId: true },
    }),
  ]);

  const touchCount = new Map<string, number>();
  for (const f of allFb) {
    const id = f.userId!;
    touchCount.set(id, (touchCount.get(id) || 0) + 1);
  }
  for (const c of allCons) {
    touchCount.set(c.customerId, (touchCount.get(c.customerId) || 0) + 1);
  }

  const recent = new Set<string>();
  for (const f of recentFb) recent.add(f.userId!);
  for (const c of recentCons) recent.add(c.customerId);

  if (segmentKey === 'loyal') {
    return [...touchCount.entries()].filter(([, n]) => n >= 3).map(([id]) => id);
  }

  if (segmentKey === 'first_visit') {
    return [...touchCount.entries()].filter(([, n]) => n === 1).map(([id]) => id);
  }

  if (segmentKey === 'sleeping') {
    const ever = new Set<string>([...touchCount.keys()]);
    return [...ever].filter((id) => !recent.has(id));
  }

  return [];
}
