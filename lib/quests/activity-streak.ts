/**
 * Etkinlik serisi — müşterinin art arda kaç İstanbul gününde işletmelere ses verdiği
 * (QR geri bildirimi ya da tüketim yorumu). Bulgu 5'in doğru hâli:
 *  - Gün sınırı Europe/Istanbul (UTC değil).
 *  - Seri "bugün ya da dün" aktifse canlıdır: bugün henüz yorum yoksa seri 0'a DÜŞMEZ,
 *    `atRisk: true` olur (gün bitene kadar korunur).
 *  - İlk boşlukta durur; boşluktan sonraki eski seriler mevcut serinin üzerine yazılmaz.
 *  - Tek sayı için ağır trend sorgusu çalışmaz: pencere içindeki yalnız `createdAt` okunur.
 *
 * Görev ekranının seri alevi buradan beslenir. Bu, giriş serisinden (lib/login-streak.ts) ve
 * mini oyun serisinden AYRIDIR; ekranda "yorum serisi" diye adlandırılır.
 */
import type { Prisma } from '@prisma/client';
import { istanbulDayKey } from './period';

export interface ActivityStreak {
  /** Art arda aktif gün sayısı (bugün ya da dünden geriye). */
  current: number;
  /** Bugün aktif mi. */
  activeToday: boolean;
  /** Dün aktif, bugün henüz değil → gün bitince seri kopar. */
  atRisk: boolean;
  /** Bakılan pencerede (LOOKBACK_DAYS) en uzun seri. */
  bestInWindow: number;
}

export const STREAK_LOOKBACK_DAYS = 60;

/** Saf hesap: aktif gün anahtarları kümesinden seri. */
export function computeActivityStreak(activeDays: ReadonlySet<string>, now: Date): ActivityStreak {
  const dayMs = 86_400_000;
  const todayKey = istanbulDayKey(now);
  const activeToday = activeDays.has(todayKey);

  // Gün anahtarlarını öğlen üzerinden yürüyerek üret (DST/fark kaymasına dayanıklı).
  const keyAt = (offsetDays: number) => istanbulDayKey(new Date(now.getTime() - offsetDays * dayMs));

  let current = 0;
  const startOffset = activeToday ? 0 : 1;
  if (activeToday || activeDays.has(keyAt(1))) {
    for (let i = startOffset; i <= STREAK_LOOKBACK_DAYS; i++) {
      if (activeDays.has(keyAt(i))) current++;
      else break;
    }
  }

  let best = 0;
  let run = 0;
  for (let i = STREAK_LOOKBACK_DAYS; i >= 0; i--) {
    if (activeDays.has(keyAt(i))) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }

  return { current, activeToday, atRisk: !activeToday && current > 0, bestInWindow: Math.max(best, current) };
}

export type StreakDb = Pick<Prisma.TransactionClient, 'feedback' | 'consumptionReview'>;

export async function getActivityStreak(db: StreakDb, userId: string, now: Date = new Date()): Promise<ActivityStreak> {
  const from = new Date(now.getTime() - (STREAK_LOOKBACK_DAYS + 1) * 86_400_000);
  const [fb, rv] = await Promise.all([
    db.feedback.findMany({
      where: { userId, deletedAt: null, createdAt: { gte: from, lte: now } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    db.consumptionReview.findMany({
      where: { customerId: userId, deletedAt: null, createdAt: { gte: from, lte: now } },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
  ]);
  const days = new Set<string>();
  for (const r of fb) days.add(istanbulDayKey(r.createdAt));
  for (const r of rv) days.add(istanbulDayKey(r.createdAt));
  return computeActivityStreak(days, now);
}
