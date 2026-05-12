import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

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

export async function creditPointsAndXp(
  db: WalletDb,
  payload: { userId: string; points?: number; xp?: number }
) {
  const points = Math.max(0, Math.floor(payload.points ?? 0));
  const xp = Math.max(0, Math.floor(payload.xp ?? 0));

  return db.user.update({
    where: { id: payload.userId },
    data: {
      ...(points > 0 ? { points: { increment: points } } : {}),
      ...(xp > 0 ? { xp: { increment: xp } } : {}),
    },
    select: { id: true, points: true, xp: true, level: true },
  });
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
