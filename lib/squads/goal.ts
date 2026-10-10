/**
 * Haftalık klan hedefi — sunucu otoriter (Bulgu 12).
 *
 * Önce: hedef sabit 5 (kimse değiştiremiyordu), tamamlanınca hiçbir şey olmuyordu, katılımdan
 * önceki geri bildirimler de sayılıyordu, hafta UTC'ydi.
 * Şimdi:
 *  - Hafta Europe/Istanbul Pazartesi 00:00 ile başlar.
 *  - Hedef = kademe × üye sayısı (lider kademeyi seçer; `Squad.weeklyTeamTarget` kademe kodu).
 *  - Her üyenin katkısı yalnız klana KATILDIĞI andan sonraki geri bildirimleridir; silinmiş,
 *    toksik ya da güven işaretli geri bildirimler sayılmaz (hedef hile ile doldurulamaz).
 *  - Hedef tamamlanınca bu hafta en az bir katkı veren her üye ödülünü bir kez alır:
 *    `mintPoints` (defter + `points_credited`, aynı tx) ve haftalık TEK anahtar
 *    `squad-weekly-goal:<hafta>:<kullanıcı>` — klan değiştirse de haftada bir kez.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { mintPoints } from '@/lib/economy/mint';
import { nextIstanbulWeekStart } from '@/components/ds/play/istanbul-time';
import {
  WEEKLY_GOAL_TIERS,
  istanbulWeekKey,
  istanbulWeekStart,
  resolveGoalTier,
  weeklyGoalTarget,
  type WeeklyGoalTier,
} from './rules';
import { squadError } from './errors';
import { membershipOf } from './membership';
import type { WeeklyGoalDto } from './dto';

type Db = Prisma.TransactionClient | typeof prisma;

/** Hedefe sayılan geri bildirim. */
const COUNTED_FEEDBACK: Prisma.FeedbackWhereInput = { deletedAt: null, isToxic: false, trustFlagged: false };

export function weeklyGoalKey(weekKey: string, userId: string): string {
  return `squad-weekly-goal:${weekKey}:${userId}`;
}

export type WeeklyGoalComputation = {
  weekStart: Date;
  weekKey: string;
  endsAt: Date;
  tier: WeeklyGoalTier;
  target: number;
  progress: number;
  reward: number;
  contributions: Map<string, number>;
};

/** Üyelerin bu haftaki katkıları (katılım anından itibaren). */
export async function computeWeeklyGoal(
  db: Db,
  squad: { weeklyTeamTarget: number },
  members: ReadonlyArray<{ userId: string; joinedAt: Date }>,
  now: Date = new Date()
): Promise<WeeklyGoalComputation> {
  const weekStart = istanbulWeekStart(now);
  const contributions = new Map<string, number>(members.map((m) => [m.userId, 0]));

  const early = members.filter((m) => m.joinedAt.getTime() <= weekStart.getTime()).map((m) => m.userId);
  const late = members.filter((m) => m.joinedAt.getTime() > weekStart.getTime());

  if (early.length > 0) {
    const grouped = await db.feedback.groupBy({
      by: ['userId'],
      where: { ...COUNTED_FEEDBACK, userId: { in: early }, createdAt: { gte: weekStart } },
      _count: { _all: true },
    });
    for (const g of grouped) {
      if (g.userId) contributions.set(g.userId, g._count._all);
    }
  }
  if (late.length > 0) {
    const counts = await Promise.all(
      late.map((m) =>
        db.feedback.count({ where: { ...COUNTED_FEEDBACK, userId: m.userId, createdAt: { gte: m.joinedAt } } })
      )
    );
    late.forEach((m, i) => contributions.set(m.userId, counts[i] ?? 0));
  }

  const tier = resolveGoalTier(squad.weeklyTeamTarget);
  const target = weeklyGoalTarget(tier, members.length);
  let progress = 0;
  for (const v of contributions.values()) progress += v;

  return {
    weekStart,
    weekKey: istanbulWeekKey(now),
    endsAt: nextIstanbulWeekStart(now),
    tier,
    target,
    progress,
    reward: WEEKLY_GOAL_TIERS[tier].reward,
    contributions,
  };
}

export function toWeeklyGoalDto(
  g: WeeklyGoalComputation,
  userId: string,
  claimed: boolean,
  isFrozen: boolean
): WeeklyGoalDto {
  const completed = g.progress >= g.target;
  const myContribution = g.contributions.get(userId) ?? 0;
  return {
    weekStart: g.weekStart.toISOString(),
    endsAt: g.endsAt.toISOString(),
    tier: g.tier,
    target: g.target,
    progress: Math.min(g.progress, g.target),
    percent: Math.min(100, Math.round((g.progress / g.target) * 100)),
    reward: g.reward,
    completed,
    myContribution,
    claimed,
    canClaim: completed && myContribution > 0 && !claimed && !isFrozen,
  };
}

export async function hasClaimedWeeklyGoal(db: Db, weekKey: string, userId: string): Promise<boolean> {
  const row = await db.pointsLedger.findUnique({
    where: { idempotencyKey: weeklyGoalKey(weekKey, userId) },
    select: { id: true },
  });
  return !!row;
}

/** Haftalık klan ödülünü al (tek-kez, sunucu doğrular). */
export async function claimWeeklyGoal(
  userId: string,
  now: Date = new Date()
): Promise<{ reward: number; credited: number; weekKey: string }> {
  const membership = await membershipOf(prisma, userId);
  if (!membership) throw squadError('NOT_SQUAD_MEMBER');
  const squad = await prisma.squad.findUnique({
    where: { id: membership.squadId },
    select: {
      id: true,
      name: true,
      isFrozen: true,
      weeklyTeamTarget: true,
      members: { select: { userId: true, joinedAt: true } },
    },
  });
  if (!squad) throw squadError('NOT_SQUAD_MEMBER');
  if (squad.isFrozen) throw squadError('SQUAD_FROZEN');

  const goal = await computeWeeklyGoal(prisma, squad, squad.members, now);
  if (goal.progress < goal.target) throw squadError('GOAL_NOT_COMPLETE');
  if ((goal.contributions.get(userId) ?? 0) < 1) throw squadError('GOAL_NOT_ELIGIBLE');

  // Kök istemci: mintPoints kendi transaction'ını açar; eşzamanlı ikinci talep P2002'de
  // ilk kaydın sonucunu `duplicate: true` ile döndürür (çift kredi yok).
  const result = await mintPoints(prisma, {
    userId,
    points: goal.reward,
    xp: Math.floor(goal.reward / 2),
    source: 'squad',
    sourceId: squad.id,
    idempotencyKey: weeklyGoalKey(goal.weekKey, userId),
    reason: `Haftalık klan hedefi (${squad.name})`,
    meta: { kind: 'squad_weekly_goal', weekKey: goal.weekKey, tier: goal.tier, target: goal.target },
    now,
  });
  if (result.duplicate) throw squadError('GOAL_ALREADY_CLAIMED');
  return { reward: goal.reward, credited: result.credited, weekKey: goal.weekKey };
}
