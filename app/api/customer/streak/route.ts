/**
 * GÜNLÜK GİRİŞ SERİSİ (login/aktivite streak) — yalnız CUSTOMER.
 *
 *   GET  → serinin güncel durumu (YAN ETKİSİZ; eskiden GET seriyi ilerletip puan veriyordu).
 *   POST → bugünü say ("dokun"): günde bir kez ilerler, kilometre taşında tek seferlik
 *          puan (`mintPoints`). Ana Sayfa açılışında bir kez çağrılır.
 *
 * NOT: /api/customer/games/streak (mini oyun serisi) AYRIDIR — bu yalnızca giriş serisidir.
 * Kilometre taşları puan matrisinden (`getLoginStreakMilestones`); ödeyen kodla aynı liste.
 */
import { prisma } from '@/lib/prisma';
import { defineRoute, ok } from '@/lib/http/define-route';
import { getLoginStreakMilestones, touchLoginStreak } from '@/lib/login-streak';
import { parseClaimedMilestones, streakSnapshot } from '@/lib/customer-home/core';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'customer.streak.read', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user }) => {
    const [row, milestones] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          loginStreakCount: true,
          loginStreakLongest: true,
          loginStreakLastDay: true,
          loginStreakClaimedMilestones: true,
        },
      }),
      getLoginStreakMilestones(),
    ]);
    const snapshot = streakSnapshot(
      {
        count: row?.loginStreakCount ?? 0,
        longest: row?.loginStreakLongest ?? 0,
        lastDay: row?.loginStreakLastDay ?? null,
        claimedMilestones: parseClaimedMilestones(row?.loginStreakClaimedMilestones),
      },
      new Date(),
      milestones
    );
    return ok({ ...snapshot, milestones }, { legacySpread: true });
  }
);

export const POST = defineRoute(
  { name: 'customer.streak.touch', roles: ['CUSTOMER'], rateLimit: 'mutation' },
  async ({ user }) => {
    const now = new Date();
    const [result, milestones] = await Promise.all([touchLoginStreak(user.id, now), getLoginStreakMilestones()]);
    const snapshot = streakSnapshot(
      {
        count: result.streak,
        longest: result.longest,
        lastDay: result.streak > 0 ? now : null,
        claimedMilestones: result.claimedMilestones,
      },
      now,
      milestones
    );
    return ok(
      {
        ...snapshot,
        // Eski istemci alanları (components/customer/login-streak-card.tsx).
        streak: snapshot.days,
        isNewDay: result.isNewDay,
        milestones,
        claimedMilestones: result.claimedMilestones,
        todayClaimed: !!result.milestoneReward,
        milestoneReward: result.milestoneReward ?? null,
      },
      { legacySpread: true }
    );
  }
);
