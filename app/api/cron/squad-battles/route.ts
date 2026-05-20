import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { finishSquadBattle } from '@/lib/gamification-engine';

// Vercel Cron Endpoint - Runs periodically to check and finish expired battles
export async function GET(req: Request) {
  // Validate Vercel Cron Token
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    // Find all active battles that have passed their end time
    const expiredBattles = await prisma.squadBattle.findMany({
      where: {
        status: 'active',
        endTime: {
          lte: now,
        },
      },
    });

    if (expiredBattles.length === 0) {
      return NextResponse.json({ message: 'No expired battles found.' });
    }

    const results = [];

    // Process each expired battle
    for (const battle of expiredBattles) {
      try {
        await finishSquadBattle(battle.id);
        results.push({ battleId: battle.id, status: 'success' });
      } catch (err: any) {
        console.error(`Error finishing battle ${battle.id}:`, err);
        results.push({ battleId: battle.id, status: 'error', error: err?.message || 'Unknown error' });
      }
    }

    return NextResponse.json({
      message: `Processed ${expiredBattles.length} expired battles.`,
      results,
    });
  } catch (error: any) {
    console.error('Squad Battles Cron Error:', error);
    return NextResponse.json({ error: 'Failed to process squad battles cron' }, { status: 500 });
  }
}
