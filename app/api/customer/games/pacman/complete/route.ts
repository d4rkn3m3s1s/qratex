import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { MINIGAME, computeMinigameReward } from '@/lib/minigame-config';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sessionId: z.string().min(1),
  starsCollected: z.number().int().min(0).max(MINIGAME.totalStars),
  /** Oyun süresi (sn) — çok kısa süre şüpheli (bot). */
  durationSec: z.number().int().min(0).max(3600),
  won: z.boolean(),
});

/**
 * POST — Oyunu bitirir ve ödülü SUNUCUDA hesaplar. Client yıldız/sonuç bildirir
 * ama ödül burada (cap'li) belirlenir. Atomik: aktif oturum guard'ı ile tek kez
 * ödül verilir; tekrar gönderim ödülü ikiletmez.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const userId = session.user.id;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const { sessionId, starsCollected, durationSec, won } = parsed.data;

    const gameSession = await prisma.miniGameSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, status: true, startedAt: true },
    });
    if (!gameSession || gameSession.userId !== userId) {
      return NextResponse.json(
        { error: 'Oturum bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (gameSession.status === 'completed') {
      return NextResponse.json(
        { error: 'Bu oyun zaten tamamlandı' },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Anti-abuse: sunucu tarafı süre kontrolü (client süresine de bakılır).
    const serverElapsedSec = Math.floor((Date.now() - gameSession.startedAt.getTime()) / 1000);
    const tooFast = serverElapsedSec < MINIGAME.minDurationSec || durationSec < MINIGAME.minDurationSec;

    // Ödül yalnızca kazanıldıysa, yeterince yıldız toplandıysa ve süre makulse.
    const eligible = won && !tooFast;
    const reward = eligible ? computeMinigameReward(starsCollected) : { points: 0, xp: 0 };

    // Atomik: yalnızca hâlâ 'active' olan oturumu 'completed'a çevirip ödül ver.
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.miniGameSession.updateMany({
        where: { id: sessionId, status: 'active' },
        data: {
          status: won ? 'completed' : 'failed',
          starsCollected,
          rewardPoints: reward.points,
          completedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        return { credited: false as const };
      }
      if (reward.points > 0 || reward.xp > 0) {
        const updated = await creditPointsAndXp(tx, {
          userId,
          points: reward.points,
          xp: reward.xp,
        });
        // Anti-fraud görünürlüğü: kredilenen puanı points_credited yaz (aynı tx).
        if (reward.points > 0) {
          await tx.analyticsEvent.create({
            data: { userId, event: 'points_credited', category: 'game', data: { points: reward.points, game: 'pacman' } },
          });
        }
        return { credited: true as const, newPoints: updated.points };
      }
      return { credited: true as const, newPoints: null };
    });

    if (!result.credited) {
      return NextResponse.json(
        { error: 'Oyun zaten tamamlandı' },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Ödül kazanıldıysa bildirim.
    if (reward.points > 0) {
      await prisma.notification.create({
        data: {
          userId,
          title: '🎮 Oyun Ödülü!',
          message: `${starsCollected} yıldız topladın ve ${reward.points} puan + ${reward.xp} XP kazandın!`,
          type: 'success',
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        rewarded: reward.points > 0,
        rewardPoints: reward.points,
        rewardXp: reward.xp,
        tooFast,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[MINIGAME_COMPLETE]', error);
    return NextResponse.json(
      { error: 'Oyun tamamlanamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
