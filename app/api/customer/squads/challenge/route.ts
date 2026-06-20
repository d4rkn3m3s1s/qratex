import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { assertModuleEnabled } from '@/lib/module-gate';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  targetSquadId: z.string().min(1),
  /** Savaş süresi (saat). 1-168 (1 hafta). */
  durationHours: z.number().int().min(1).max(168).optional(),
  /** Kazanan klanın üyelerine dağıtılacak ödül havuzu (puan). */
  rewardPool: z.number().int().min(0).max(100000).optional(),
});

/**
 * POST — Klan meydan okuması. Yalnızca klan SAHİBİ başka bir klana meydan okuyabilir.
 * status='pending' savaş oluşturur; rakip klan sahibi kabul edene kadar başlamaz.
 */
export async function POST(req: Request) {
  try {
    const gate = await assertModuleEnabled('squads');
    if (gate) return gate;

    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'CUSTOMER') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const { targetSquadId, durationHours = 24, rewardPool = 0 } = parsed.data;

    // Meydan okuyan: kendi sahip olduğu klan.
    const mySquad = await prisma.squad.findFirst({
      where: { ownerId: session.user.id },
      select: { id: true, name: true },
    });
    if (!mySquad) {
      return NextResponse.json(
        { error: 'Meydan okumak için bir klanın sahibi olmalısınız' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (targetSquadId === mySquad.id) {
      return NextResponse.json(
        { error: 'Kendi klanınıza meydan okuyamazsınız' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const target = await prisma.squad.findUnique({
      where: { id: targetSquadId },
      select: { id: true, name: true, ownerId: true, isFrozen: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: 'Rakip klan bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (target.isFrozen) {
      return NextResponse.json(
        { error: 'Rakip klan şu anda dondurulmuş' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // İki klandan biri zaten açık (pending/active) savaştaysa engelle.
    const existing = await prisma.squadBattle.findFirst({
      where: {
        status: { in: ['pending', 'active'] },
        OR: [
          { squad1Id: mySquad.id },
          { squad2Id: mySquad.id },
          { squad1Id: target.id },
          { squad2Id: target.id },
        ],
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Klanlardan biri zaten bir savaşta veya bekleyen meydan okuması var' },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const now = new Date();
    const battle = await prisma.squadBattle.create({
      data: {
        squad1Id: mySquad.id,
        squad2Id: target.id,
        status: 'pending',
        startTime: now, // kabul edilince güncellenir
        endTime: new Date(now.getTime() + durationHours * 60 * 60 * 1000),
        rewardPool,
        challengedById: session.user.id,
      },
    });

    // Rakip klan sahibine bildirim.
    await prisma.notification.create({
      data: {
        userId: target.ownerId,
        title: '⚔️ Klan Savaşı Daveti',
        message: `${mySquad.name} klanınıza meydan okudu! Ödül havuzu: ${rewardPool} puan. Kabul etmek için klan sayfanıza gidin.`,
        type: 'info',
        data: { battleId: battle.id, kind: 'squad_battle_challenge' },
      },
    });

    return NextResponse.json(
      { success: true, battleId: battle.id },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[SQUAD_CHALLENGE]', error);
    return NextResponse.json(
      { error: 'Meydan okuma oluşturulamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
