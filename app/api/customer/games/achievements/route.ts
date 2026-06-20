import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { evaluateAchievements } from '@/lib/game-achievements';
import { computeAchievementStats } from '@/lib/game-achievement-stats';

export const dynamic = 'force-dynamic';

/**
 * GET — Oyuncunun mini oyun başarımları + ilerlemeleri. Tüm metrikler
 * MiniGameSession'dan türetilir (ayrı tablo yok). Oyun Merkezi'ndeki
 * "Başarımlar" bölümü bunu gösterir.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Unauthorized', achievements: [] },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const userId = session.user.id;

    const stats = await computeAchievementStats(prisma, userId);
    const achievements = evaluateAchievements(stats);
    const unlockedCount = achievements.filter((a) => a.unlocked).length;

    return NextResponse.json(
      { success: true, stats, achievements, unlockedCount, total: achievements.length },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[MINIGAME_ACHIEVEMENTS]', error);
    return NextResponse.json(
      { error: 'Başarımlar alınamadı', achievements: [] },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
