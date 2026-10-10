/**
 * GÜNLÜK GİRİŞ SERİSİ (login/aktivite streak) — yalnız CUSTOMER.
 *
 *   GET  → serinin güncel durumu (YAN ETKİSİZ; eskiden GET seriyi ilerletip puan veriyordu).
 *   POST → bugünü say ("dokun"): günde bir kez ilerler, kilometre taşında tek seferlik
 *          puan (`mintPoints`). Ana Sayfa açılışında bir kez çağrılır.
 *
 * NOT: /api/customer/games/streak (mini oyun serisi) ve /api/streak (UserStreak loyalty)
 * AYRIDIR — bu yalnızca giriş serisidir.
 */
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { LOGIN_STREAK_MILESTONES, touchLoginStreak } from '@/lib/login-streak';
import { parseClaimedMilestones, streakSnapshot } from '@/lib/customer-home/core';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'customer.streak.read', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user }) => {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        loginStreakCount: true,
        loginStreakLongest: true,
        loginStreakLastDay: true,
        loginStreakClaimedMilestones: true,
      },
    });
    const snapshot = streakSnapshot(
      {
        count: row?.loginStreakCount ?? 0,
        longest: row?.loginStreakLongest ?? 0,
        lastDay: row?.loginStreakLastDay ?? null,
        claimedMilestones: parseClaimedMilestones(row?.loginStreakClaimedMilestones),
      },
      new Date(),
      LOGIN_STREAK_MILESTONES
    );
    return ok({ ...snapshot, milestones: LOGIN_STREAK_MILESTONES }, { legacySpread: true });
  }
);

export const POST = defineRoute(
  { name: 'customer.streak.touch', roles: ['CUSTOMER'], rateLimit: 'mutation' },
  async ({ user }) => {
    const now = new Date();
    const result = await touchLoginStreak(user.id, now);
    const snapshot = streakSnapshot(
      {
        count: result.streak,
        longest: result.longest,
        lastDay: result.streak > 0 ? now : null,
        claimedMilestones: result.claimedMilestones,
      },
      now,
      LOGIN_STREAK_MILESTONES
    );
    return ok(
      {
        ...snapshot,
        // Eski istemci alanları (components/customer/login-streak-card.tsx).
        streak: snapshot.days,
        isNewDay: result.isNewDay,
        milestones: LOGIN_STREAK_MILESTONES,
        claimedMilestones: result.claimedMilestones,
        todayClaimed: !!result.milestoneReward,
        milestoneReward: result.milestoneReward ?? null,
      },
      { legacySpread: true }
    );
  }
);
