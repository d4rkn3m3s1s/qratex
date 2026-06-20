import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated-prisma-client';
import { creditPointsAndXp } from '@/lib/points-wallet';
import type { AutomationAction, AutomationCondition, AutomationRunResult } from './types';

export function buildUserWhere(condition: AutomationCondition): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (condition.role) where.role = condition.role;
  if (typeof condition.minPoints === 'number' || typeof condition.maxPoints === 'number') {
    where.points = {};
    if (typeof condition.minPoints === 'number') where.points.gte = condition.minPoints;
    if (typeof condition.maxPoints === 'number') where.points.lte = condition.maxPoints;
  }
  if (typeof condition.minLevel === 'number' || typeof condition.maxLevel === 'number') {
    where.level = {};
    if (typeof condition.minLevel === 'number') where.level.gte = condition.minLevel;
    if (typeof condition.maxLevel === 'number') where.level.lte = condition.maxLevel;
  }
  if (condition.emailIncludes) where.email = { contains: condition.emailIncludes, mode: 'insensitive' };
  if (condition.businessNameIncludes) where.businessName = { contains: condition.businessNameIncludes, mode: 'insensitive' };

  const now = new Date();
  const mergeCreatedAt = (patch: Prisma.DateTimeFilter): void => {
    const prev = where.createdAt;
    const base: Prisma.DateTimeFilter =
      prev && typeof prev === 'object' && !(prev instanceof Date)
        ? { ...(prev as Prisma.DateTimeFilter) }
        : {};
    where.createdAt = { ...base, ...patch };
  };
  if (typeof condition.createdBeforeDays === 'number' && condition.createdBeforeDays > 0) {
    const beforeDate = new Date(now);
    beforeDate.setDate(beforeDate.getDate() - condition.createdBeforeDays);
    mergeCreatedAt({ lte: beforeDate });
  }
  if (typeof condition.createdAfterDays === 'number' && condition.createdAfterDays > 0) {
    const afterDate = new Date(now);
    afterDate.setDate(afterDate.getDate() - condition.createdAfterDays);
    mergeCreatedAt({ gte: afterDate });
  }
  return where;
}

async function applyAction(userId: string, action: AutomationAction) {
  switch (action.type) {
    case 'add_points': {
      await prisma.user.update({
        where: { id: userId },
        data: { points: { increment: action.amount } },
      });
      if (action.reason) {
        await prisma.notification.create({
          data: {
            userId,
            title: action.amount >= 0 ? 'Puan Kazandınız! 🎉' : 'Puan Degisikligi',
            message: `${action.amount} puan uygulandi: ${action.reason}`,
            type: action.amount >= 0 ? 'success' : 'warning',
          },
        });
      }
      return;
    }
    case 'add_xp': {
      // TEK kaynak: creditPointsAndXp (geometrik calculateLevel). Önceden linear
      // floor(xp/1000)+1 ile canonical formülle çelişiyordu. Negatif XP desteklenmez
      // (creditPointsAndXp yalnızca artırır) — automation add_xp pozitif kullanılır.
      await creditPointsAndXp(prisma, { userId, xp: Math.max(0, action.amount) });
      return;
    }
    case 'set_role': {
      await prisma.user.update({ where: { id: userId }, data: { role: action.role } });
      return;
    }
    case 'send_notification': {
      await prisma.notification.create({
        data: {
          userId,
          title: action.title,
          message: action.message,
          type: action.notificationType || 'info',
        },
      });
      return;
    }
    default:
      return;
  }
}

export async function runAutomationActions(params: {
  condition: AutomationCondition;
  actions: AutomationAction[];
  dryRun?: boolean;
  limit?: number;
}): Promise<AutomationRunResult> {
  const { condition, actions, dryRun = false, limit = 500 } = params;
  const where = buildUserWhere(condition);
  const users = await prisma.user.findMany({
    where,
    take: Math.max(1, Math.min(limit, 1000)),
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  });

  if (dryRun) {
    return {
      affectedCount: users.length,
      successCount: 0,
      failedCount: 0,
      failures: [],
      sampleUserIds: users.slice(0, 20).map((u) => u.id),
    };
  }

  let successCount = 0;
  let failedCount = 0;
  const failures: Array<{ userId: string; error: string }> = [];

  for (const user of users) {
    try {
      for (const action of actions) {
        await applyAction(user.id, action);
      }
      successCount += 1;
    } catch (error) {
      failedCount += 1;
      failures.push({
        userId: user.id,
        error: error instanceof Error ? error.message : 'Bilinmeyen hata',
      });
    }
  }

  return {
    affectedCount: users.length,
    successCount,
    failedCount,
    failures,
    sampleUserIds: users.slice(0, 20).map((u) => u.id),
  };
}
