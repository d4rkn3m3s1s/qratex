import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * GET — Kullanıcının klanının GÜNCEL savaşı (pending veya active) + rolü.
 * Klan savaşı paneli bu tek endpoint'i polling ile kullanır.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const membership = await prisma.squadMember.findFirst({
      where: { userId: session.user.id },
      select: { squadId: true, squad: { select: { ownerId: true } } },
    });
    if (!membership) {
      return NextResponse.json(
        { success: true, battle: null, isOwner: false },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const isOwner = membership.squad.ownerId === session.user.id;

    const battle = await prisma.squadBattle.findFirst({
      where: {
        status: { in: ['pending', 'active'] },
        OR: [{ squad1Id: membership.squadId }, { squad2Id: membership.squadId }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        squad1Score: true,
        squad2Score: true,
        rewardPool: true,
        challengedById: true,
        squad1: { select: { id: true, name: true } },
        squad2: { select: { id: true, name: true } },
      },
    });

    if (!battle) {
      return NextResponse.json(
        { success: true, battle: null, isOwner },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const mySquadId = membership.squadId;
    const isChallenger = battle.squad1.id === mySquadId;
    // Bekleyen meydan okumayı yalnızca rakip (squad2) klanın sahibi yanıtlayabilir.
    const canRespond = battle.status === 'pending' && isOwner && battle.squad2.id === mySquadId;

    return NextResponse.json(
      {
        success: true,
        isOwner,
        battle: {
          ...battle,
          mySquadId,
          isChallenger,
          canRespond,
          myScore: isChallenger ? battle.squad1Score : battle.squad2Score,
          opponentScore: isChallenger ? battle.squad2Score : battle.squad1Score,
          opponentName: isChallenger ? battle.squad2.name : battle.squad1.name,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[SQUAD_BATTLE_CURRENT]', error);
    return NextResponse.json(
      { error: 'Savaş durumu alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
