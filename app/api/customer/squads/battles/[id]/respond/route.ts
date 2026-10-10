import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { assertModuleEnabled } from '@/lib/module-gate';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { cancelSquadBattle } from '@/lib/squad-battle-service';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  action: z.enum(['accept', 'reject']),
});

/**
 * PATCH — Bekleyen klan savaşı meydan okumasına yanıt. Yalnızca RAKİP klanın
 * (squad2) sahibi kabul/ret edebilir. Kabul: status→active, başlangıç şimdi,
 * her iki klanın üyeleri katılımcı olarak eklenir. Ret: status→cancelled.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const battle = await prisma.squadBattle.findUnique({
      where: { id },
      include: {
        squad1: { select: { id: true, name: true, ownerId: true, members: { select: { userId: true } } } },
        squad2: { select: { id: true, name: true, ownerId: true, members: { select: { userId: true } } } },
      },
    });
    if (!battle) {
      return NextResponse.json(
        { error: 'Savaş bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    if (battle.status !== 'pending') {
      return NextResponse.json(
        { error: 'Bu meydan okuma artık beklemede değil' },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    // Yalnızca meydan okunan klanın (squad2) sahibi yanıtlayabilir.
    if (battle.squad2.ownerId !== session.user.id) {
      return NextResponse.json(
        { error: 'Bu meydan okumaya yanıt verme yetkiniz yok' },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    if (parsed.data.action === 'reject') {
      // P0-20: tek servis — atomik claim (yalnız hâlâ 'pending' ise) + soft-cancel +
      // defterli escrow iadesi (tek-kez) + bildirim + audit. Silme yok.
      const r = await cancelSquadBattle(prisma, id, {
        actorId: session.user.id,
        actorRole: 'owner',
        reason: 'Rakip klan meydan okumayı reddetti',
        fromStatuses: ['pending'],
      });
      if (r.status === 'noop') {
        return NextResponse.json(
          { error: 'Bu meydan okuma artık beklemede değil' },
          { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
        );
      }
      return NextResponse.json(
        { success: true, status: 'cancelled', refunded: r.refunded },
        { headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Kabul: savaşı başlat + katılımcıları oluştur.
    const now = new Date();
    const durationMs = battle.endTime.getTime() - battle.startTime.getTime();
    const newEnd = new Date(now.getTime() + Math.max(durationMs, 60 * 60 * 1000));

    const participants = [
      ...battle.squad1.members.map((m) => ({
        battleId: battle.id,
        squadId: battle.squad1.id,
        userId: m.userId,
      })),
      ...battle.squad2.members.map((m) => ({
        battleId: battle.id,
        squadId: battle.squad2.id,
        userId: m.userId,
      })),
    ];

    const accepted = await prisma.$transaction(async (tx) => {
      // Atomik kabul: yalnızca hâlâ 'pending' ise aktive et (eşzamanlı çift kabul
      // veya kabul/ret yarışında tek biri geçer).
      const claim = await tx.squadBattle.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'active', startTime: now, endTime: newEnd, acceptedAt: now },
      });
      if (claim.count === 0) return false;
      if (participants.length > 0) {
        await tx.squadBattleParticipant.createMany({
          data: participants,
          skipDuplicates: true,
        });
      }
      return true;
    });

    if (!accepted) {
      return NextResponse.json(
        { error: 'Bu meydan okuma artık beklemede değil' },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Meydan okuyana bildirim.
    if (battle.challengedById) {
      await prisma.notification.create({
        data: {
          userId: battle.challengedById,
          title: '⚔️ Savaş Başladı!',
          message: `${battle.squad2.name} meydan okumanızı kabul etti. Savaş başladı — en çok puanı toplayın!`,
          type: 'success',
          data: { battleId: battle.id },
        },
      });
    }

    return NextResponse.json(
      { success: true, status: 'active', endTime: newEnd.toISOString() },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[SQUAD_BATTLE_RESPOND]', error);
    return NextResponse.json(
      { error: 'Yanıt işlenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
