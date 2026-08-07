import { prisma } from '@/lib/prisma';
import { creditPointsAndXp } from '@/lib/points-wallet';

/**
 * GÜNLÜK GİRİŞ SERİSİ (login / aktivite streak).
 *
 * Kullanıcı customer paneline her "dokunduğunda" (touchLoginStreak) çağrılır ve
 * günde YALNIZCA BİR KEZ ilerler. Kilometre taşlarında (3/7/14/30 gün) atomik +
 * idempotent puan ödülü verir.
 *
 * Bu sistem şunlardan TAMAMEN BAĞIMSIZDIR:
 *  - MİNİ OYUN serisi (MiniGameSession / GameStreakClaim, app/api/customer/games/streak).
 *  - UserStreak loyalty tablosu (app/api/streak).
 * Veri, User modelindeki loginStreak* alanlarında tutulur.
 *
 * Puan ekonomisi değişmezleri (points-economy-invariants):
 *  - Ödül ATOMİK: creditPointsAndXp + points_credited AnalyticsEvent aynı tx'te.
 *  - İdempotent: aynı gün iki kez ilerlemez (koşullu updateMany guard'ı),
 *    aynı kilometre taşı iki kez ödüllenmez (claimedMilestones bayrağı).
 *  - Puan asla "mint" edilmez anlamında bu bir ödül/teşvik kredisidir; görünürlük
 *    için points_credited olayı yazılır (caps + velocity dedektörü görür).
 */

/** Ödüllü kilometre taşları: gün → puan. Artan sırada tutulur. */
export const LOGIN_STREAK_MILESTONES: ReadonlyArray<{ days: number; points: number }> = [
  { days: 3, points: 50 },
  { days: 7, points: 150 },
  { days: 14, points: 300 },
  { days: 30, points: 1000 },
];

/** "YYYY-MM-DD" (UTC) — backend UTC kuralı (lib/timezone.ts). */
export function loginDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Verilen UTC gününün başlangıcı (00:00:00.000Z). */
function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** claimedMilestones JSON'unu güvenli biçimde number[]'a çevir. */
function parseClaimedMilestones(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'number' ? Math.floor(v) : Number.NaN))
    .filter((v) => Number.isFinite(v));
}

export type MilestoneReward = {
  days: number;
  points: number;
};

export type TouchLoginStreakResult = {
  /** Güncel ardışık gün sayısı. */
  streak: number;
  /** Ulaşılan en uzun seri. */
  longest: number;
  /** Bu çağrıda gün ilk kez mi sayıldı (bugün ilk dokunuş)? */
  isNewDay: boolean;
  /** Bu çağrıda YENİ kazanılan kilometre taşı ödülü (varsa). */
  milestoneReward?: MilestoneReward;
  /** Şu ana dek ödüllenmiş kilometre taşları (idempotent bayrak). */
  claimedMilestones: number[];
};

/**
 * Kullanıcının günlük giriş serisini "dokunur":
 *  - loginStreakLastDay bugünle (UTC gün) aynı ise: NO-OP, mevcut durumu döner.
 *  - Dün ise: streak++ (seri devam).
 *  - Daha eski / null ise: streak=1 (seri kırıldı, yeniden başladı).
 *  - longest güncellenir.
 *  - Yeni streak bir kilometre taşına ULAŞTIYSA ve daha önce ödüllenmemişse:
 *    atomik puan ödülü + claimedMilestones'a ekleme + bildirim.
 *
 * Hata durumunda akışı bozmaz: sağlam bir "no reward" sonucu döner. Ödül verme
 * ile bayrak set etme AYNI transaction'da olduğu için ödül kaybı/çift ödül olmaz.
 */
export async function touchLoginStreak(userId: string): Promise<TouchLoginStreakResult> {
  try {
    const now = new Date();
    const todayStart = utcDayStart(now);

    // Mevcut durum (ön okuma — asıl koruma tx içindeki koşullu updateMany).
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        loginStreakCount: true,
        loginStreakLongest: true,
        loginStreakLastDay: true,
        loginStreakClaimedMilestones: true,
      },
    });

    if (!existing) {
      return { streak: 0, longest: 0, isNewDay: false, claimedMilestones: [] };
    }

    const claimedBefore = parseClaimedMilestones(existing.loginStreakClaimedMilestones);
    const lastDay = existing.loginStreakLastDay ? utcDayStart(existing.loginStreakLastDay) : null;

    // Bugün zaten sayıldıysa: NO-OP (idempotent). Ön kontrol.
    if (lastDay && lastDay.getTime() === todayStart.getTime()) {
      return {
        streak: existing.loginStreakCount,
        longest: existing.loginStreakLongest,
        isNewDay: false,
        claimedMilestones: claimedBefore,
      };
    }

    // Yeni streak değerini hesapla: dün ise +1, değilse 1'e sıfırla.
    let nextStreak = 1;
    if (lastDay) {
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
      if (lastDay.getTime() === yesterdayStart.getTime()) {
        nextStreak = existing.loginStreakCount + 1;
      }
    }
    const nextLongest = Math.max(existing.loginStreakLongest, nextStreak);

    // Bu streak yeni bir (ödüllenmemiş) kilometre taşına denk geliyor mu?
    // Tam eşleşme aranır (3,7,14,30). "Kaçırılan" milestone geri ödenmez.
    const milestone = LOGIN_STREAK_MILESTONES.find(
      (m) => m.days === nextStreak && !claimedBefore.includes(m.days)
    );

    const result = await prisma.$transaction(async (tx) => {
      // ATOMİK gün guard'ı: yalnızca lastDay bugünden ÖNCE ya da null iken ilerlet.
      // İki eşzamanlı dokunuştan yalnızca biri count=1 alır → ödül tek kez.
      const guard = await tx.user.updateMany({
        where: {
          id: userId,
          OR: [{ loginStreakLastDay: null }, { loginStreakLastDay: { lt: todayStart } }],
        },
        data: {
          loginStreakCount: nextStreak,
          loginStreakLongest: nextLongest,
          loginStreakLastDay: now,
        },
      });

      if (guard.count === 0) {
        // Başka bir eşzamanlı çağrı bugünü zaten saydı.
        return { isNewDay: false as const, milestoneReward: undefined };
      }

      // Kilometre taşı ödülü — yalnızca guard'ı biz kazandıysak.
      if (milestone) {
        await creditPointsAndXp(tx, { userId, points: milestone.points });

        // Anti-fraud görünürlüğü: kredilenen puanı points_credited olarak işle
        // (caps + velocity dedektörü login streak ekonomisini de görsün).
        await tx.analyticsEvent.create({
          data: {
            userId,
            event: 'points_credited',
            category: 'login_streak',
            data: { points: milestone.points, milestone: milestone.days },
          },
        });

        // İdempotent bayrak: claimedMilestones'a ekle (aynı tx).
        const nextClaimed = [...claimedBefore, milestone.days].sort((a, b) => a - b);
        await tx.user.update({
          where: { id: userId },
          data: { loginStreakClaimedMilestones: nextClaimed },
        });

        // Kutlama bildirimi.
        await tx.notification.create({
          data: {
            userId,
            type: 'success',
            title: `🔥 ${milestone.days} günlük serin!`,
            message: `Harika! ${milestone.days} gün üst üste geldin ve +${milestone.points} puan kazandın.`,
            data: { kind: 'login_streak_milestone', days: milestone.days, points: milestone.points },
          },
        });

        return { isNewDay: true as const, milestoneReward: { days: milestone.days, points: milestone.points } };
      }

      return { isNewDay: true as const, milestoneReward: undefined };
    });

    if (!result.isNewDay) {
      // Yarışı kaybettik ya da guard tutmadı → güncel durumu yeniden oku.
      const fresh = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          loginStreakCount: true,
          loginStreakLongest: true,
          loginStreakClaimedMilestones: true,
        },
      });
      return {
        streak: fresh?.loginStreakCount ?? existing.loginStreakCount,
        longest: fresh?.loginStreakLongest ?? existing.loginStreakLongest,
        isNewDay: false,
        claimedMilestones: parseClaimedMilestones(fresh?.loginStreakClaimedMilestones),
      };
    }

    const claimedAfter = result.milestoneReward
      ? [...claimedBefore, result.milestoneReward.days].sort((a, b) => a - b)
      : claimedBefore;

    return {
      streak: nextStreak,
      longest: nextLongest,
      isNewDay: true,
      milestoneReward: result.milestoneReward,
      claimedMilestones: claimedAfter,
    };
  } catch (error) {
    // Streak akışı hiçbir zaman ana isteği bozmamalı.
    console.error('[LOGIN_STREAK] touch failed', error);
    return { streak: 0, longest: 0, isNewDay: false, claimedMilestones: [] };
  }
}
