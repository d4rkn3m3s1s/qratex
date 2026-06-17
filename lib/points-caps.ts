/**
 * Gamification anti-exploit: günlük/haftalık puan tavanları (madde 42).
 * Aynı davranışla sınırsız puan kazanımını sınırlar.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type CapsDb = Prisma.TransactionClient | typeof prisma;

const DAILY_FEEDBACK_POINTS_CAP = 500;
const WEEKLY_FEEDBACK_POINTS_CAP = 2000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  // Pazartesi'yi haftanın başı kabul et, tamamen UTC üzerinden hesapla.
  const x = new Date(d);
  const day = x.getUTCDay(); // 0=Pazar ... 6=Cumartesi
  const diffToMonday = day === 0 ? -6 : 1 - day; // Pazar ise -6 gün, diğer günler 1-day
  x.setUTCDate(x.getUTCDate() + diffToMonday);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Bugün kullanıcının feedback kaynaklı kazandığı puan toplamı (AnalyticsEvent points_credited) */
export async function getDailyFeedbackPointsEarned(userId: string, db: CapsDb = prisma): Promise<number> {
  const start = startOfDay(new Date());
  const events = await db.analyticsEvent.findMany({
    where: {
      userId,
      event: 'points_credited',
      category: 'feedback',
      createdAt: { gte: start },
    },
    select: { data: true },
  });
  let sum = 0;
  for (const e of events) {
    const d = e.data as { points?: number } | null;
    if (d && typeof d.points === 'number') sum += d.points;
  }
  return sum;
}

/** Bu hafta kullanıcının feedback kaynaklı kazandığı puan toplamı */
export async function getWeeklyFeedbackPointsEarned(userId: string, db: CapsDb = prisma): Promise<number> {
  const start = startOfWeek(new Date());
  const events = await db.analyticsEvent.findMany({
    where: {
      userId,
      event: 'points_credited',
      category: 'feedback',
      createdAt: { gte: start },
    },
    select: { data: true },
  });
  let sum = 0;
  for (const e of events) {
    const d = e.data as { points?: number } | null;
    if (d && typeof d.points === 'number') sum += d.points;
  }
  return sum;
}

/** Verilecek puanı günlük ve haftalık tavana göre kısaltır */
export async function capFeedbackPoints(userId: string, points: number, db: CapsDb = prisma): Promise<number> {
  const [daily, weekly] = await Promise.all([
    getDailyFeedbackPointsEarned(userId, db),
    getWeeklyFeedbackPointsEarned(userId, db),
  ]);
  const afterDaily = Math.max(0, DAILY_FEEDBACK_POINTS_CAP - daily);
  const afterWeekly = Math.max(0, WEEKLY_FEEDBACK_POINTS_CAP - weekly);
  return Math.min(points, afterDaily, afterWeekly);
}
