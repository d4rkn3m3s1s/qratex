/**
 * Günlük çark — sunucu otoriter mantık (`/api/gamification/spin` ve Ana Sayfa BFF'i paylaşır).
 *
 *  - Gün: Europe/Istanbul (DailySpin.day = İstanbul takvim günü, `@db.Date`).
 *  - Hak: `(userId, day)` satırında `count < dailyLimit` koşullu artış (atomik; eşzamanlı
 *    iki çevirmeden fazlası hakkı aşamaz).
 *  - Ödül: yalnız `mintPoints` (kilit + defter + `points_credited`), tek-kez anahtarı
 *    `spin:<userId>:<gün>:<sıra>` → aynı hak iki kez ödenmez.
 *  - Ağırlıklar istemciye gitmez; kazanan sunucuda seçilir.
 */
import { prisma } from '@/lib/prisma';
import { mintPoints } from '@/lib/economy';
import { getPointsMatrix, getSpinRules, pickSpinPrize, type SpinPrizeRule } from '@/lib/points-rules';
import { getVariant } from '@/lib/gamification-ab';
import { istanbulDay } from '@/components/ds/page/date-range';
import { dayKeyToDbDate, nextResetAt } from './core';
import type { HomeSpin } from './types';

export const SPIN_NOTIFICATION_TITLE = '🎡 Günlük Çark';

export async function readSpinCount(userId: string, day: string): Promise<number> {
  const row = await prisma.dailySpin.findUnique({
    where: { userId_day: { userId, day: dayKeyToDbDate(day) } },
    select: { count: true },
  });
  return row?.count ?? 0;
}

/** Çarkın bugünkü durumu; çark kapalıysa null. */
export async function getSpinStatus(userId: string, now: Date = new Date(), usedToday?: number): Promise<HomeSpin | null> {
  const rules = getSpinRules(await getPointsMatrix());
  if (!rules.enabled) return null;
  const used = usedToday ?? (await readSpinCount(userId, istanbulDay(now)));
  return {
    dailyLimit: rules.dailyLimit,
    remaining: Math.max(0, rules.dailyLimit - used),
    prizes: rules.prizes.map((p) => ({ id: p.id, label: p.label, type: p.type, value: p.value })),
    resetAt: nextResetAt(now).toISOString(),
  };
}

export type SpinOutcome =
  | { kind: 'disabled' }
  | { kind: 'limit' }
  | {
      kind: 'ok';
      prize: { id: string; type: SpinPrizeRule['type']; value: number; label: string; index: number };
      /** Gerçekte kredilenen (tavan/gölge ban sonrası) puan ve XP. */
      credited: { points: number; xp: number };
      balance: number | null;
      level: number | null;
      isLevelUp: boolean;
      remaining: number;
      dailyLimit: number;
      resetAt: string;
    };

export async function performSpin(userId: string, now: Date = new Date(), random?: number): Promise<SpinOutcome> {
  const matrix = await getPointsMatrix();
  const rules = getSpinRules(matrix);
  if (!rules.enabled) return { kind: 'disabled' };

  const dayKey = istanbulDay(now);
  const day = dayKeyToDbDate(dayKey);
  const prize = pickSpinPrize(matrix, random);
  const prizeIndex = Math.max(0, rules.prizes.findIndex((p) => p.id === prize.id));
  const abVariant = await getVariant(userId, 'reward_copy').catch(() => null);

  const result = await prisma.$transaction(async (tx) => {
    await tx.dailySpin.upsert({
      where: { userId_day: { userId, day } },
      create: { userId, day, count: 0 },
      update: {},
    });
    const bumped = await tx.dailySpin.updateMany({
      where: { userId, day, count: { lt: rules.dailyLimit } },
      data: { count: { increment: 1 } },
    });
    if (bumped.count === 0) return null;

    const row = await tx.dailySpin.findUnique({ where: { userId_day: { userId, day } }, select: { count: true } });
    const ordinal = row?.count ?? 1;

    let credited = { points: 0, xp: 0 };
    let balance: number | null = null;
    let level: number | null = null;
    let isLevelUp = false;
    if (prize.type !== 'nothing' && prize.value > 0) {
      const minted = await mintPoints(tx, {
        userId,
        points: prize.type === 'points' ? prize.value : 0,
        xp: prize.type === 'xp' ? prize.value : 0,
        source: 'spin',
        sourceId: prize.id,
        idempotencyKey: `spin:${userId}:${dayKey}:${ordinal}`,
        reason: 'Günlük çark',
        meta: { prizeId: prize.id, prizeType: prize.type, day: dayKey },
        now,
      });
      credited = { points: minted.credited, xp: minted.xpCredited };
      balance = minted.points;
      level = minted.level;
      isLevelUp = minted.isLevelUp;
    }

    const message =
      prize.type === 'points'
        ? `Çarktan ${credited.points} puan kazandınız!`
        : prize.type === 'xp'
          ? `Çarktan ${credited.xp} XP kazandınız!`
          : 'Bir dahaki sefere şansınız açık olsun!';

    await tx.notification.create({
      data: {
        userId,
        type: prize.type === 'nothing' ? 'info' : 'success',
        title: SPIN_NOTIFICATION_TITLE,
        message,
        data: {
          prizeId: prize.id,
          prizeType: prize.type,
          prizeValue: prize.value,
          prizeLabel: prize.label,
          credited,
          spinDay: dayKey,
          dailyLimit: rules.dailyLimit,
        },
      },
    });

    // A/B ölçümü (ödül görünürlüğü ayrı: points_credited'ı mintPoints yazar).
    await tx.analyticsEvent.create({
      data: {
        userId,
        event: 'gamification_ab_impression',
        category: 'gamification',
        data: { experiment: 'reward_copy', variant: abVariant ?? 'default', outcome: prize.type, prizeId: prize.id },
      },
    });

    return { ordinal, credited, balance, level, isLevelUp };
  });

  if (!result) return { kind: 'limit' };

  return {
    kind: 'ok',
    prize: { id: prize.id, type: prize.type, value: prize.value, label: prize.label, index: prizeIndex },
    credited: result.credited,
    balance: result.balance,
    level: result.level,
    isLevelUp: result.isLevelUp,
    remaining: Math.max(0, rules.dailyLimit - result.ordinal),
    dailyLimit: rules.dailyLimit,
    resetAt: nextResetAt(now).toISOString(),
  };
}
