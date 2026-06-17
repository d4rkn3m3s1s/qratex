import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { finishSquadBattle } from '@/lib/gamification-engine';
import { authorizeInternalJobRequest, unauthorizedInternalJob } from '@/lib/inngest/internal-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Süresi dolan (endTime geçmiş, status='active') klan savaşlarını otomatik bitirir.
 * Önceden yalnızca admin elle kapatabiliyordu; bu iş bir inngest cron'una bağlandı.
 */
export async function POST(req: NextRequest) {
  if (!authorizeInternalJobRequest(req)) return unauthorizedInternalJob();

  const now = new Date();
  const expired = await prisma.squadBattle.findMany({
    where: { status: 'active', endTime: { lte: now } },
    select: { id: true },
    take: 100,
  });

  if (expired.length === 0) {
    return NextResponse.json({ finished: 0 });
  }

  let finished = 0;
  const errors: Array<{ battleId: string; error: string }> = [];
  for (const battle of expired) {
    try {
      await finishSquadBattle(battle.id);
      finished += 1;
    } catch (err) {
      errors.push({ battleId: battle.id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return NextResponse.json({ finished, errors });
}
