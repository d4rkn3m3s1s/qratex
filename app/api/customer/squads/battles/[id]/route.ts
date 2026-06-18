import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * GET — Klan savaşı canlı durumu (skor tablosu). Yalnızca iki klandan birinin
 * üyesi görebilir. Polling ile canlı skor güncellemesi için kullanılır.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const { id } = await params;
    const battle = await prisma.squadBattle.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        squad1Score: true,
        squad2Score: true,
        winnerId: true,
        rewardPool: true,
        squad1: { select: { id: true, name: true } },
        squad2: { select: { id: true, name: true } },
      },
    });
    if (!battle) {
      return NextResponse.json(
        { error: 'Savaş bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Yetki: kullanıcı iki klandan birinin üyesi olmalı.
    const membership = await prisma.squadMember.findFirst({
      where: {
        userId: session.user.id,
        squadId: { in: [battle.squad1.id, battle.squad2.id] },
      },
      select: { squadId: true },
    });
    if (!membership && session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Bu savaşı görme yetkiniz yok' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // En çok katkı yapan katılımcılar (her iki klandan).
    const topParticipants = await prisma.squadBattleParticipant.findMany({
      where: { battleId: id, score: { gt: 0 } },
      orderBy: { score: 'desc' },
      take: 10,
      select: {
        score: true,
        squadId: true,
        user: { select: { name: true, image: true } },
      },
    });

    return NextResponse.json(
      {
        success: true,
        battle: {
          ...battle,
          topParticipants: topParticipants.map((p) => ({
            name: p.user.name,
            image: p.user.image,
            score: p.score,
            squadId: p.squadId,
          })),
          mySquadId: membership?.squadId ?? null,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[SQUAD_BATTLE_GET]', error);
    return NextResponse.json(
      { error: 'Savaş durumu alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
