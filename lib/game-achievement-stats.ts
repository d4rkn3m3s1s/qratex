import type { Prisma, PrismaClient } from '@prisma/client';
import type { AchievementStats } from '@/lib/game-achievements';

type Db = PrismaClient | Prisma.TransactionClient;

function addDays(key: string, delta: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Bir oyuncunun mini oyun başarım istatistiklerini MiniGameSession'dan hesaplar.
 * Hem achievements API'si hem complete route (yeni rozet tespiti) kullanır.
 */
export async function computeAchievementStats(db: Db, userId: string): Promise<AchievementStats> {
  const sessions = await db.miniGameSession.findMany({
    where: { userId, status: { in: ['completed', 'failed'] } },
    select: { gameType: true, status: true, starsCollected: true, dayKey: true },
  });

  const completed = sessions.filter((s) => s.status === 'completed');
  const totalWins = completed.filter((s) => s.starsCollected > 0).length;
  const totalPlays = sessions.length;
  const distinctGames = new Set(completed.map((s) => s.gameType)).size;
  const bestScore = sessions.reduce((m, s) => Math.max(m, s.starsCollected), 0);

  const days = [...new Set(completed.map((s) => s.dayKey))].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    if (prev && addDays(prev, 1) === d) run += 1;
    else run = 1;
    if (run > longest) longest = run;
    prev = d;
  }

  return { totalWins, distinctGames, bestScore, totalPlays, streak: longest };
}
