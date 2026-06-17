/**
 * Leaderboard anti-cheat: anormal hızda puan artışı tespiti.
 * Son 24 saat points_credited toplamı eşik aşımında suspicious flag.
 */
import { prisma } from '@/lib/prisma';

const HOURS = 24;
const THRESHOLD = 500; // 24 saatte 500+ puan şüpheli

export async function getPointsDelta24h(userId: string): Promise<number> {
  const since = new Date();
  since.setHours(since.getHours() - HOURS);

  const events = await prisma.analyticsEvent.findMany({
    where: {
      userId,
      event: 'points_credited',
      createdAt: { gte: since },
    },
    select: { data: true },
  });

  let total = 0;
  for (const e of events) {
    const d = e.data as { points?: number } | null;
    if (d && typeof d.points === 'number') total += d.points;
  }
  return total;
}

export async function isSuspiciousPoints(userId: string): Promise<boolean> {
  const delta = await getPointsDelta24h(userId);
  return delta >= THRESHOLD;
}

/**
 * Birden çok kullanıcı için şüpheli puan tespitini TEK sorguda yapar.
 * Leaderboard'da N kullanıcı için N ayrı findMany (N+1) yerine kullanılır.
 * @@index([userId, event, createdAt]) ile desteklenir.
 */
export async function getSuspiciousUserIds(userIds: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  if (userIds.length === 0) return result;

  const since = new Date();
  since.setHours(since.getHours() - HOURS);

  const events = await prisma.analyticsEvent.findMany({
    where: {
      userId: { in: userIds },
      event: 'points_credited',
      createdAt: { gte: since },
    },
    select: { userId: true, data: true },
  });

  const totals = new Map<string, number>();
  for (const e of events) {
    if (!e.userId) continue;
    const d = e.data as { points?: number } | null;
    if (d && typeof d.points === 'number') {
      totals.set(e.userId, (totals.get(e.userId) ?? 0) + d.points);
    }
  }
  for (const [uid, total] of totals) {
    if (total >= THRESHOLD) result.add(uid);
  }
  return result;
}
