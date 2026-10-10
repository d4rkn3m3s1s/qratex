import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated-prisma-client';
import { mintPoints } from '@/lib/economy/mint';
import { debitPoints, InsufficientPointsError } from '@/lib/points-wallet';
import { isEconomyError } from '@/lib/economy/errors';
import type { AutomationAction, AutomationCondition, AutomationRunResult } from './types';
import { AUTOMATION_LIMITS, parseAutomation, type ValidatedAction } from './schema';

/**
 * Otomasyon motoru (P0-19).
 *
 * Değişmezler:
 *  - Puan/XP yalnız `mintPoints` (defter + `points_credited` aynı tx) ve `debitPoints`
 *    (eksi bakiye imkânsız) ile değişir. Önceden negatif tutar ham `increment` yapıyordu.
 *  - Her (çalıştırma × aksiyon × kullanıcı) için tek-kez anahtarı: iş yeniden denense de
 *    kimseye ikinci kez puan basılmaz / düşülmez.
 *  - Bir kullanıcının bütün aksiyonları tek transaction'da: ya hepsi ya hiçbiri.
 *  - `set_role` ADMIN üretemez ve ADMIN hesaplara dokunmaz; rol değişince oturum sürümü
 *    artırılır (eski JWT'ler geçersizleşir).
 *  - Askıdaki ve anonimleştirilmiş hesaplar hedeflenmez; çalıştıran admin kendine puan basamaz.
 */

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
  // Askıdaki / anonimleştirilmiş hesaplar hiçbir otomasyonun hedefi değildir.
  where.suspendedAt = null;
  where.anonymizedAt = null;
  return where;
}

/** Hedef sorgusu: koşul + çalıştıran admin hariç + kararlı sıra (dry-run ile aynı küme). */
export function buildTargetQuery(condition: AutomationCondition, opts: { excludeUserId?: string | null; limit?: number }) {
  const where = buildUserWhere(condition);
  if (opts.excludeUserId) where.id = { not: opts.excludeUserId };
  const take = Math.max(1, Math.min(opts.limit ?? AUTOMATION_LIMITS.defaultUsersPerRun, AUTOMATION_LIMITS.maxUsersPerRun));
  return { where, take, orderBy: [{ createdAt: 'desc' as const }, { id: 'asc' as const }] };
}

export class AutomationActionError extends Error {}

const fmt = (n: number) => Math.abs(n).toLocaleString('tr-TR');

async function applyUserActions(
  user: { id: string; role: string },
  actions: ValidatedAction[],
  ctx: { runKey: string; actorId: string | null }
) {
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < actions.length; i += 1) {
      const action = actions[i];
      const key = `automation:${ctx.runKey}:${i}:${user.id}`;
      switch (action.type) {
        case 'add_points': {
          if (action.amount > 0) {
            const r = await mintPoints(tx, {
              userId: user.id,
              points: action.amount,
              source: 'automation',
              sourceId: ctx.runKey,
              idempotencyKey: key,
              actorId: ctx.actorId,
              reason: action.reason,
              capCategory: null, // tavan kural düzeyinde (kişi başı + çalıştırma toplamı)
            });
            if (!r.duplicate) {
              await tx.notification.create({
                data: {
                  userId: user.id,
                  title: 'Puan Kazandınız! 🎉',
                  message: `${fmt(action.amount)} puan hesabınıza eklendi: ${action.reason}`,
                  type: 'success',
                },
              });
            }
          } else {
            try {
              const r = await debitPoints(tx, {
                userId: user.id,
                points: -action.amount,
                source: 'automation',
                sourceId: ctx.runKey,
                idempotencyKey: key,
                actorId: ctx.actorId,
                reason: action.reason,
              });
              if (!r.duplicate) {
                await tx.notification.create({
                  data: {
                    userId: user.id,
                    title: 'Puan Düzeltmesi',
                    message: `${fmt(action.amount)} puan hesabınızdan düşüldü: ${action.reason}`,
                    type: 'warning',
                  },
                });
              }
            } catch (e) {
              if (e instanceof InsufficientPointsError) {
                throw new AutomationActionError(
                  `Yetersiz bakiye (mevcut ${fmt(e.currentPoints)}, düşülecek ${fmt(e.requiredPoints)})`
                );
              }
              throw e;
            }
          }
          break;
        }
        case 'add_xp': {
          await mintPoints(tx, {
            userId: user.id,
            points: 0,
            xp: action.amount,
            source: 'automation',
            sourceId: ctx.runKey,
            idempotencyKey: key,
            actorId: ctx.actorId,
            capCategory: null,
          });
          break;
        }
        case 'set_role': {
          // ADMIN hesaplar otomasyonla değiştirilemez (yükseltme şemada zaten yok).
          if (user.role === 'ADMIN' || user.role === action.role) break;
          await tx.user.updateMany({
            where: { id: user.id, role: { not: 'ADMIN' } },
            data: { role: action.role, sessionVersion: { increment: 1 } },
          });
          break;
        }
        case 'send_notification': {
          await tx.notification.create({
            data: {
              userId: user.id,
              title: action.title,
              message: action.message,
              type: action.notificationType || 'info',
            },
          });
          break;
        }
        default:
          break;
      }
    }
  });
}

export async function runAutomationActions(params: {
  condition: AutomationCondition;
  actions: AutomationAction[];
  dryRun?: boolean;
  limit?: number;
  /** Tek-kez anahtarlarının kökü (iş id'si). Gerçek çalıştırmada ZORUNLU. */
  runKey?: string;
  /** Çalıştıran admin: defterde aktör, hedef kümesinden hariç. */
  actorId?: string | null;
}): Promise<AutomationRunResult> {
  const { dryRun = false } = params;
  const parsed = parseAutomation(params.condition, params.actions);
  if (!parsed.ok) throw new AutomationActionError(parsed.error);
  if (!dryRun && !params.runKey) {
    throw new AutomationActionError('Çalıştırma kimliği olmadan otomasyon yürütülemez.');
  }

  const q = buildTargetQuery(parsed.condition, { excludeUserId: params.actorId ?? null, limit: params.limit });
  const users = await prisma.user.findMany({ ...q, select: { id: true, role: true } });

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
      await applyUserActions(user, parsed.actions, { runKey: params.runKey as string, actorId: params.actorId ?? null });
      successCount += 1;
    } catch (error) {
      failedCount += 1;
      failures.push({
        userId: user.id,
        error:
          error instanceof AutomationActionError || isEconomyError(error)
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Bilinmeyen hata',
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
