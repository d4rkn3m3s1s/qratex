import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { calculateLevel } from '@/lib/utils';

type WalletDb = Prisma.TransactionClient | typeof prisma;

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
  if (nextLevel !== updatedUser.level) {
    const bump = await db.user.updateMany({
      where: { id: payload.userId, level: { lt: nextLevel } },
      data: { level: nextLevel },
    });
    return {
      id: updatedUser.id,
      points: updatedUser.points,
      xp: updatedUser.xp,
      level: nextLevel,
      isLevelUp: bump.count > 0,
    };
  }

  return {
    id: updatedUser.id,
    points: updatedUser.points,
    xp: updatedUser.xp,
    level: updatedUser.level,
    isLevelUp: leveledUp,
  };
}

export async function debitPoints(db: WalletDb, payload: { userId: string; points: number }) {
  const points = Math.max(0, Math.floor(payload.points));
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

  return updated;
}
