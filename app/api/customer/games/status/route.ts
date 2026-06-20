import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * GET — Oyuncunun BUGÜN tamamladığı oyunların gameType listesini döndürür.
 * Oyun Merkezi (hub) bununla "bugün oynandı" rozetini ve günlük ilerlemeyi
 * gösterir. Pacman dahil tüm gameType'lar kapsanır.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Unauthorized', playedToday: [] },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const rows = await prisma.miniGameSession.findMany({
      where: { userId: session.user.id, dayKey: todayKey(), status: 'completed' },
      select: { gameType: true },
    });

    return NextResponse.json(
      { success: true, playedToday: rows.map((r) => r.gameType) },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[MINIGAME_STATUS]', error);
    return NextResponse.json(
      { error: 'Durum alınamadı', playedToday: [] },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
