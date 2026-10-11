/**
 * Mağaza ve Ödüller — TALEPLER (UserReward teslim zinciri). Rapor admin_rewards B12.
 *
 * Durum (şemada `status` yok — ŞEMA İSTEĞİ; mevcut alanlardan türetilir):
 *   cancelled  ← `CANCEL_USER_REWARD` denetim kaydı var
 *   fulfilled  ← `claimedAt` dolu (bayi kasası, müşteri "kullandım" ya da admin "teslim edildi")
 *   pending    ← `claimedAt` boş
 *
 * İptal + iade TEK transaction'da: `claimedAt` koşullu yazımı (çift iptal/çift iade imkânsız) →
 * ödenen puan `mintPoints` ile iade (tavansız, fraud kapısı kapalı: kullanıcının KENDİ puanı;
 * `reward-refund:<id>` tek-kez anahtarı) → sınırlı stok geri eklenir → denetim + bildirim.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { mintPoints } from '@/lib/economy';
import {
  REWARD_TYPES,
  type Paged,
  type RedemptionActionInput,
  type RedemptionItem,
  type RedemptionListQuery,
  type RedemptionStats,
  type RewardType,
} from './contract';
import { readPool } from './code-pool';
import { DAY_MS } from './shared.server';

type ReqLike = { headers: { get(name: string): string | null } } | null;

const refundKey = (id: string) => `reward-refund:${id}`;
const rewardType = (t: string): RewardType => ((REWARD_TYPES as readonly string[]).includes(t) ? (t as RewardType) : 'digital');

async function cancelledIds(ids?: string[]): Promise<Set<string>> {
  const rows = await prisma.auditLog.findMany({
    where: { action: 'CANCEL_USER_REWARD', entity: 'UserReward', ...(ids ? { entityId: { in: ids } } : {}) },
    select: { entityId: true },
    take: ids ? undefined : 20_000,
  });
  return new Set(rows.map((r) => r.entityId).filter((x): x is string => !!x));
}

type Row = {
  id: string;
  code: string | null;
  redeemedAt: Date;
  claimedAt: Date | null;
  userId: string;
  rewardId: string;
  user: { id: string; name: string | null; email: string | null };
  reward: { id: string; name: string; type: string; icon: string };
};

/**
 * Talebin ödendiği defter satırı: aynı tx'te yazılan `source='reward'`, aynı kullanıcı ve ödül,
 * zamanı talebe en yakın borç. Bulunamazsa 0.
 *
 * Admin hediyesi (`grant_reward` denetim kaydı olan talep) HİÇ ödenmemiştir → eşleştirmeye
 * katılmaz. Aksi hâlde aynı kullanıcı aynı ödülü hediyeden ±60 sn içinde satın aldıysa hediye
 * satırı o borcu "ödeme" sanıyor, hediyenin iptali karşılığı olmayan puan basıyordu.
 */
async function paidFor(rows: Row[], db: Prisma.TransactionClient | typeof prisma = prisma): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (rows.length === 0) return out;
  const gifts = await db.auditLog.findMany({
    where: { action: 'grant_reward', entity: 'user_reward', entityId: { in: rows.map((r) => r.id) } },
    select: { entityId: true },
  });
  const giftIds = new Set(gifts.map((g) => g.entityId).filter((x): x is string => !!x));
  rows = rows.filter((r) => !giftIds.has(r.id));
  if (rows.length === 0) return out;
  const min = new Date(Math.min(...rows.map((r) => r.redeemedAt.getTime())) - 60_000);
  const max = new Date(Math.max(...rows.map((r) => r.redeemedAt.getTime())) + 5_000);
  const ledger = await db.pointsLedger.findMany({
    where: {
      source: 'reward',
      delta: { lt: 0 },
      userId: { in: [...new Set(rows.map((r) => r.userId))] },
      sourceId: { in: [...new Set(rows.map((r) => r.rewardId))] },
      createdAt: { gte: min, lte: max },
    },
    select: { id: true, userId: true, sourceId: true, delta: true, createdAt: true },
  });
  const used = new Set<string>();
  for (const r of rows) {
    let best: (typeof ledger)[number] | null = null;
    let bestGap = Infinity;
    for (const l of ledger) {
      if (used.has(l.id) || l.userId !== r.userId || l.sourceId !== r.rewardId) continue;
      const gap = r.redeemedAt.getTime() - l.createdAt.getTime();
      if (gap < -5_000 || gap > 60_000) continue;
      if (Math.abs(gap) < bestGap) {
        best = l;
        bestGap = Math.abs(gap);
      }
    }
    if (best) {
      used.add(best.id);
      out.set(r.id, Math.abs(best.delta));
    }
  }
  return out;
}

const ROW_SELECT = {
  id: true,
  code: true,
  redeemedAt: true,
  claimedAt: true,
  userId: true,
  rewardId: true,
  user: { select: { id: true, name: true, email: true } },
  reward: { select: { id: true, name: true, type: true, icon: true } },
} as const;

async function toItems(rows: Row[]): Promise<RedemptionItem[]> {
  const ids = rows.map((r) => r.id);
  const [cancelled, paid, refunds] = await Promise.all([
    cancelledIds(ids),
    paidFor(rows),
    ids.length
      ? prisma.pointsLedger.findMany({ where: { idempotencyKey: { in: ids.map(refundKey) } }, select: { idempotencyKey: true, delta: true } })
      : Promise.resolve([]),
  ]);
  const refundMap = new Map(refunds.map((r) => [r.idempotencyKey ?? '', r.delta]));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    status: cancelled.has(r.id) ? 'cancelled' : r.claimedAt ? 'fulfilled' : 'pending',
    redeemedAt: r.redeemedAt.toISOString(),
    claimedAt: r.claimedAt?.toISOString() ?? null,
    paidPoints: paid.get(r.id) ?? 0,
    refundedPoints: Math.max(0, refundMap.get(refundKey(r.id)) ?? 0),
    user: r.user,
    reward: { id: r.reward.id, name: r.reward.name, type: rewardType(r.reward.type), icon: r.reward.icon },
  }));
}

export async function listRedemptions(q: Partial<RedemptionListQuery> & { page: number; size: number }): Promise<Paged<RedemptionItem>> {
  const needle = q.q?.trim();
  const where: Prisma.UserRewardWhereInput = {
    ...(q.rewardId ? { rewardId: q.rewardId } : {}),
    ...(q.type ? { reward: { type: q.type } } : {}),
    ...(needle
      ? {
          OR: [
            { code: { contains: needle, mode: 'insensitive' } },
            { user: { email: { contains: needle, mode: 'insensitive' } } },
            { user: { name: { contains: needle, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  if (q.status === 'pending') where.claimedAt = null;
  if (q.status === 'fulfilled' || q.status === 'cancelled') {
    const cancelled = [...(await cancelledIds())];
    where.claimedAt = { not: null };
    if (q.status === 'cancelled') where.id = { in: cancelled };
    else if (cancelled.length) where.id = { notIn: cancelled };
  }

  const [total, rows] = await Promise.all([
    prisma.userReward.count({ where }),
    prisma.userReward.findMany({
      where,
      select: ROW_SELECT,
      orderBy: [{ redeemedAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.size,
      take: q.size,
    }),
  ]);
  return {
    items: await toItems(rows),
    total,
    page: q.page,
    size: q.size,
  };
}

export async function getRedemptionStats(now = new Date()): Promise<RedemptionStats> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [pending, pendingPhysical, fulfilledRaw, cancelled30d] = await Promise.all([
    prisma.userReward.count({ where: { claimedAt: null } }),
    prisma.userReward.count({ where: { claimedAt: null, reward: { type: 'physical' } } }),
    prisma.userReward.count({ where: { claimedAt: { gte: since } } }),
    prisma.auditLog.count({ where: { action: 'CANCEL_USER_REWARD', createdAt: { gte: since } } }),
  ]);
  return { pending, pendingPhysical, fulfilled30d: Math.max(0, fulfilledRaw - cancelled30d), cancelled30d };
}

export async function redemptionAction(id: string, input: RedemptionActionInput, actor: AuditActor, request: ReqLike): Promise<RedemptionItem> {
  const row = await prisma.userReward.findUnique({ where: { id }, select: ROW_SELECT });
  if (!row) throw new ApiError('NOT_FOUND', 'Talep bulunamadı.');
  const now = new Date();

  if (input.action === 'fulfil') {
    await prisma.$transaction(async (tx) => {
      const n = await tx.userReward.updateMany({ where: { id, claimedAt: null }, data: { claimedAt: now } });
      if (n.count === 0) throw new ApiError('CONFLICT', 'Bu talep zaten teslim edilmiş, kullanılmış ya da iptal edilmiş.');
      await tx.auditLog.create({
        data: auditEntry(
          actor,
          { action: 'FULFIL_USER_REWARD', entity: 'UserReward', entityId: id, newData: { rewardId: row.rewardId, userId: row.userId, note: input.note ?? null, at: now.toISOString() } },
          request
        ),
      });
      await tx.notification.create({
        data: {
          userId: row.userId,
          title: 'Ödülün teslim edildi',
          message: `${row.reward.name} ödülün teslim edildi olarak işaretlendi.${input.note ? ` Not: ${input.note}` : ''}`.slice(0, 500),
          type: 'success',
          data: { type: 'reward_fulfilled', userRewardId: id, href: '/customer/wallet/owned' },
        },
      });
    });
  } else {
    await prisma.$transaction(async (tx) => {
      // Koşullu yazım: yalnız bekleyen talep iptal edilir; ikinci iptal 0 satır → 409.
      const n = await tx.userReward.updateMany({ where: { id, claimedAt: null }, data: { claimedAt: now } });
      if (n.count === 0) throw new ApiError('CONFLICT', 'Yalnız bekleyen talepler iptal edilebilir; bu talep kullanılmış ya da iptal edilmiş.');
      const paid = (await paidFor([row], tx)).get(id) ?? 0;
      let refunded = 0;
      if (paid > 0) {
        const r = await mintPoints(tx, {
          userId: row.userId,
          points: paid,
          source: 'reward_refund',
          sourceId: id,
          idempotencyKey: refundKey(id),
          actorId: actor.id,
          reason: `Ödül talebi iptali: ${row.reward.name}`.slice(0, 200),
          capCategory: null,
          fraudGate: false,
          meta: { rewardId: row.rewardId, userRewardId: id },
        });
        refunded = r.credited;
      }
      const reward = await tx.reward.findUnique({ where: { id: row.rewardId }, select: { stock: true, metadata: true } });
      // Sınırlı stok geri eklenir; havuzlu ödülde kod partnere verilmiş sayılır (havuza dönmez).
      const restock = !!reward && reward.stock >= 0 && !readPool(reward.metadata).enabled;
      if (restock) await tx.reward.update({ where: { id: row.rewardId }, data: { stock: { increment: 1 } } });
      await tx.auditLog.create({
        data: auditEntry(
          actor,
          {
            action: 'CANCEL_USER_REWARD',
            entity: 'UserReward',
            entityId: id,
            oldData: { status: 'pending' },
            newData: { rewardId: row.rewardId, userId: row.userId, reason: input.reason, paidPoints: paid, refundedPoints: refunded, restocked: restock },
          },
          request
        ),
      });
      await tx.notification.create({
        data: {
          userId: row.userId,
          title: 'Ödül talebin iptal edildi',
          message: `${row.reward.name} talebin iptal edildi${refunded > 0 ? `; ${refunded.toLocaleString('tr-TR')} puan hesabına iade edildi` : ''}. Gerekçe: ${input.reason}`.slice(0, 500),
          type: 'info',
          data: { type: 'reward_cancelled', userRewardId: id, refundedPoints: refunded },
        },
      });
    });
  }

  const fresh = await prisma.userReward.findUnique({ where: { id }, select: ROW_SELECT });
  if (!fresh) throw new ApiError('NOT_FOUND', 'Talep bulunamadı.');
  const [item] = await toItems([fresh]);
  return item;
}
