import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { finishSquadBattle } from '@/lib/gamification-engine';
import { creditPointsAndXp } from '@/lib/points-wallet';

export const dynamic = 'force-dynamic';

/** En fazla işlenecek savaş sayısı (fan-out DoS sınırı). */
const MAX_BATTLES_PER_RUN = 200;

/** Sabit-zamanlı Bearer secret karşılaştırması. */
function validBearer(authHeader: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const got = authHeader ?? '';
  if (got.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Vercel Cron Endpoint — süresi dolan savaşları sonlandırır + escrow iadelerini yapar.
export async function GET(req: Request) {
  // FAIL-CLOSED: CRON_SECRET yoksa endpoint kapalı (önceden secret yoksa auth
  // tamamen atlanıyordu → herkes elle force-settle edebiliyordu).
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET ayarlı değil; cron devre dışı.' },
      { status: 503 }
    );
  }
  if (!validBearer(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    // 1. Süresi dolan AKTİF savaşlar → sonlandır (atomik claim + escrow ödemesi).
    const expiredBattles = await prisma.squadBattle.findMany({
      where: { status: 'active', endTime: { lte: now } },
      select: { id: true },
      take: MAX_BATTLES_PER_RUN,
    });

    // 2. Süresi dolan ama hiç kabul edilmeyen PENDING savaşlar → iptal + escrow iadesi
    //    (aksi halde meydan okuyanın puanı sonsuza dek kilitli kalırdı).
    const stalePending = await prisma.squadBattle.findMany({
      where: { status: 'pending', endTime: { lte: now } },
      select: { id: true, rewardPool: true, rewardFunded: true, rewardRefunded: true, challengedById: true },
      take: MAX_BATTLES_PER_RUN,
    });

    const results: Array<{ battleId: string; status: string; error?: string }> = [];

    for (const battle of expiredBattles) {
      try {
        await finishSquadBattle(battle.id);
        results.push({ battleId: battle.id, status: 'finished' });
      } catch (err: any) {
        console.error(`Error finishing battle ${battle.id}:`, err);
        results.push({ battleId: battle.id, status: 'error', error: err?.message || 'Unknown error' });
      }
    }

    for (const battle of stalePending) {
      try {
        await prisma.$transaction(async (tx) => {
          const claim = await tx.squadBattle.updateMany({
            where: { id: battle.id, status: 'pending' },
            data: { status: 'cancelled' },
          });
          if (claim.count === 0) return;
          if (battle.rewardFunded && !battle.rewardRefunded && battle.rewardPool > 0 && battle.challengedById) {
            await creditPointsAndXp(tx, { userId: battle.challengedById, points: battle.rewardPool });
            await tx.squadBattle.update({ where: { id: battle.id }, data: { rewardRefunded: true } });
            await tx.analyticsEvent.create({
              data: {
                userId: battle.challengedById,
                event: 'points_credited',
                category: 'squad_battle_refund',
                data: { points: battle.rewardPool, battleId: battle.id },
              },
            });
          }
        });
        results.push({ battleId: battle.id, status: 'expired_refunded' });
      } catch (err: any) {
        console.error(`Error expiring pending battle ${battle.id}:`, err);
        results.push({ battleId: battle.id, status: 'error', error: err?.message || 'Unknown error' });
      }
    }

    return NextResponse.json({
      message: `Processed ${expiredBattles.length} expired + ${stalePending.length} stale-pending battles.`,
      results,
    });
  } catch (error: any) {
    console.error('Squad Battles Cron Error:', error);
    return NextResponse.json({ error: 'Failed to process squad battles cron' }, { status: 500 });
  }
}
