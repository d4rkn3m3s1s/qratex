/**
 * Gamification anti-exploit: günlük/haftalık puan tavanları (madde 42).
 * Aynı davranışla sınırsız puan kazanımını sınırlar.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
// Gün/hafta sınırı TEK kaynaktan (lib/timezone) — yerel kopya divergence riski yaratıyordu.
import { startOfDayUTC as startOfDay, startOfWeekUTC as startOfWeek } from '@/lib/timezone';
// Tavan değerleri TEK kaynaktan (lib/economy/caps.ts). Yeni kod doğrudan `mintPoints`
// kullanmalı — tavan orada kilit altında, aynı tx'te uygulanır.
import { applyCategoryCap, FEEDBACK_DAILY_CAP, FEEDBACK_WEEKLY_CAP } from '@/lib/economy/caps';

type CapsDb = Prisma.TransactionClient | typeof prisma;

const DAILY_FEEDBACK_POINTS_CAP = FEEDBACK_DAILY_CAP;
const WEEKLY_FEEDBACK_POINTS_CAP = FEEDBACK_WEEKLY_CAP;

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

/**
 * Mini oyun ödülünü oyun kategorisinin günlük (600) ve haftalık (3.000) tavanına göre
 * kısaltır (P0-17). Oyun tamamlama transaction'ı içinde, kredi ÖNCESİ çağrılmalı;
 * eşzamanlılık için mümkünse doğrudan `mintPoints({ source: 'game', ... })` kullanın.
 */
export async function capGamePoints(userId: string, points: number, db: CapsDb = prisma): Promise<number> {
  const decision = await applyCategoryCap(db, { userId, category: 'game', points });
  return decision.granted;
}

/**
 * Bayi pasif (tüketim) puanını müşteri × bayi × gün (300) ve müşteri × gün (600)
 * tavanına göre kısaltır (P0-13/P0-21). Geçiş yolu; yeni kod `mintPoints` +
 * `source: 'dealer_passive'` + `actorId: dealerId` kullanmalı.
 */
export async function capDealerPassivePoints(
  userId: string,
  dealerId: string,
  points: number,
  db: CapsDb = prisma
): Promise<number> {
  const decision = await applyCategoryCap(db, { userId, category: 'dealer_passive', points, actorId: dealerId });
  return decision.granted;
}
