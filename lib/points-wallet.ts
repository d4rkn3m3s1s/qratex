import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { calculateLevel } from '@/lib/utils';
import { EconomyError } from '@/lib/economy/errors';
import { captureCreditMoments } from '@/lib/moments/server';

type WalletDb = Prisma.TransactionClient | typeof prisma;

// NOT (lib/economy): yeni puan basan kod `mintPoints` (lib/economy) kullanır — tavan,
// tek-kez, defter ve points_credited orada. creditPointsAndXp düşük seviye primitiftir;
// imzası 19+ çağıran yüzünden SABİT kalır.

export class InsufficientPointsError extends Error {
  currentPoints: number;
  requiredPoints: number;

  constructor(currentPoints: number, requiredPoints: number) {
    super('Insufficient points');
    this.name = 'InsufficientPointsError';
    this.currentPoints = currentPoints;
    this.requiredPoints = requiredPoints;
  }
}

export type CreditPointsAndXpResult = {
  id: string;
  points: number;
  xp: number;
  level: number;
  isLevelUp: boolean;
};

export async function creditPointsAndXp(
  db: WalletDb,
  payload: { userId: string; points?: number; xp?: number }
): Promise<CreditPointsAndXpResult> {
  const points = Math.max(0, Math.floor(payload.points ?? 0));
  const xpToAdd = Math.max(0, Math.floor(payload.xp ?? 0));

  // 1. Puan ve XP'yi ATOMİK olarak artır. Level'ı burada yazmıyoruz çünkü
  //    eşzamanlı kredilerde stale read'den hesaplanan level yanlış/eski olur.
  const updatedUser = await db.user.update({
    where: { id: payload.userId },
    data: {
      ...(points > 0 ? { points: { increment: points } } : {}),
      ...(xpToAdd > 0 ? { xp: { increment: xpToAdd } } : {}),
    },
    select: { id: true, points: true, xp: true, level: true },
  });

  // 2. Level'ı, increment SONRASI gerçek toplam XP'den hesapla (atomik sonuç).
  const nextLevel = calculateLevel(updatedUser.xp);
  const leveledUp = nextLevel > updatedUser.level;

  // 3. Sadece level gerçekten değiştiyse ve hâlâ daha düşükse koşullu güncelle.
  //    updateMany + level guard ile iki eşzamanlı krediden yalnızca biri
  //    level'ı yukarı taşır; isLevelUp yalnızca o çağrı için true döner.
  let result: CreditPointsAndXpResult;
  if (nextLevel !== updatedUser.level) {
    const bump = await db.user.updateMany({
      where: { id: payload.userId, level: { lt: nextLevel } },
      data: { level: nextLevel },
    });
    result = {
      id: updatedUser.id,
      points: updatedUser.points,
      xp: updatedUser.xp,
      level: nextLevel,
      isLevelUp: bump.count > 0,
    };
  } else {
    result = {
      id: updatedUser.id,
      points: updatedUser.points,
      xp: updatedUser.xp,
      level: updatedUser.level,
      isLevelUp: leveledUp,
    };
  }

  // 4. An Motoru: seviye atlama + lig yükselme anları (aynı db/tx; asla fırlatmaz,
  //    tx içinde SAVEPOINT ile yalıtılır). Dönüş tipi DEĞİŞMEZ.
  if (result.isLevelUp || points > 0) {
    await captureCreditMoments(db, {
      userId: payload.userId,
      pointsAdded: points,
      pointsAfter: updatedUser.points,
      xpAfter: updatedUser.xp,
      levelBefore: updatedUser.level,
      levelAfter: result.level,
      isLevelUp: result.isLevelUp,
    });
  }

  return result;
}

export type DebitPointsPayload = {
  userId: string;
  points: number;
  /** Harcama yolu: shop | gift | reward | badge_unlock | donation | squad_escrow | admin_adjust … (varsayılan 'spend'). */
  source?: string;
  /** Harcanan kaydın id'si (ürün, ödül, savaş …). */
  sourceId?: string | null;
  /** Tek-kez anahtarı (PointsLedger.idempotencyKey). Aynı anahtarla ikinci çağrı borçlandırmaz. */
  idempotencyKey?: string | null;
  actorId?: string | null;
  reason?: string | null;
  meta?: Record<string, unknown> | null;
};

export type DebitPointsResult = {
  id: string;
  points: number;
  xp: number;
  level: number;
  /** Yazılan defter satırı (tutar 0 ise null). */
  ledgerId?: string | null;
  /** Aynı idempotencyKey daha önce işlenmiş; bu çağrıda borçlandırma yapılmadı. */
  duplicate?: boolean;
};

const DEBIT_SOURCE_RE = /^[a-z][a-z0-9_.:-]{0,63}$/;

/**
 * Puanı borçlandırır — negatif bakiye İMKÂNSIZ: `points >= tutar` guard'lı tek atomik
 * updateMany (eşzamanlı iki harcamadan yalnızca bakiyesi yetenler geçer).
 *
 * Defterli: aynı transaction içinde PointsLedger satırı (delta < 0, balanceAfter) ve
 * `points_spent` analytics olayı yazılır ("Benim Yılım" harcanan puan artık 0 değil).
 * Kök istemciyle çağrılırsa kendi transaction'ını açar (borç + defter birlikte).
 *
 * Yetersiz bakiyede InsufficientPointsError (geriye uyumlu).
 */
export async function debitPoints(db: WalletDb, payload: DebitPointsPayload): Promise<DebitPointsResult> {
  const points = Math.max(0, Math.floor(Number.isFinite(payload.points) ? payload.points : 0));
  if (points === 0) {
    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, points: true, xp: true, level: true },
    });

    if (!user) {
      throw new InsufficientPointsError(0, 0);
    }

    return user;
  }

  const source = payload.source ?? 'spend';
  if (!DEBIT_SOURCE_RE.test(source)) {
    throw new EconomyError('INVALID_INPUT', 'Geçersiz harcama kaynağı.', { source });
  }

  if (typeof (db as { $transaction?: unknown }).$transaction === 'function') {
    return (db as typeof prisma).$transaction((tx) => debitInTx(tx, payload, points, source));
  }
  return debitInTx(db as Prisma.TransactionClient, payload, points, source);
}

async function debitInTx(
  db: Prisma.TransactionClient,
  payload: DebitPointsPayload,
  points: number,
  source: string
): Promise<DebitPointsResult> {
  const idempotencyKey = payload.idempotencyKey ?? null;
  if (idempotencyKey) {
    const existing = await db.pointsLedger.findUnique({
      where: { idempotencyKey },
      select: { id: true, userId: true, delta: true },
    });
    if (existing) {
      if (existing.userId !== payload.userId || existing.delta > 0) {
        throw new EconomyError('IDEMPOTENCY_CONFLICT', 'Bu işlem anahtarı başka bir işleme ait.');
      }
      const wallet = await db.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, points: true, xp: true, level: true },
      });
      if (!wallet) throw new InsufficientPointsError(0, points);
      return { ...wallet, ledgerId: existing.id, duplicate: true };
    }
  }

  const debitResult = await db.user.updateMany({
    where: {
      id: payload.userId,
      points: { gte: points },
    },
    data: {
      points: { decrement: points },
    },
  });

  if (debitResult.count === 0) {
    const wallet = await db.user.findUnique({
      where: { id: payload.userId },
      select: { points: true },
    });
    throw new InsufficientPointsError(wallet?.points ?? 0, points);
  }

  const updated = await db.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, points: true, xp: true, level: true },
  });

  if (!updated) {
    throw new InsufficientPointsError(0, points);
  }

  // Aynı anahtarla eşzamanlı ikinci borç burada P2002 ile düşer → tx geri alınır
  // (fail-closed: çift borç yok, ilk işlem geçerli kalır).
  const ledger = await db.pointsLedger.create({
    data: {
      userId: payload.userId,
      delta: -points,
      balanceAfter: updated.points,
      source,
      sourceId: payload.sourceId ?? null,
      idempotencyKey,
      status: 'posted',
      actorId: payload.actorId ?? null,
      reason: payload.reason ? String(payload.reason).slice(0, 500) : null,
      ...(payload.meta ? { meta: payload.meta as Prisma.InputJsonObject } : {}),
    },
    select: { id: true },
  });

  await db.analyticsEvent.create({
    data: {
      userId: payload.userId,
      event: 'points_spent',
      category: source,
      data: {
        points,
        sourceId: payload.sourceId ?? null,
        ledgerId: ledger.id,
      },
    },
  });

  return { ...updated, ledgerId: ledger.id, duplicate: false };
}
