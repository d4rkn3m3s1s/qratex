import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { settleSquadBattle } from '@/lib/squad-battle-service';
import { triggerConfetti } from '@/lib/effects/confetti';
import { SQUAD_POWER_SHARE } from '@/lib/squads/rules';

/**
 * Klan Savaşını Sonlandır ve Ödülleri Dağıt.
 *
 * P0-20: Tek kaynak `lib/squad-battle-service.ts#settleSquadBattle` (atomik claim +
 * `paidOutAt` guard'ı + kişi başı tek-kez defterli ödeme + escrow iadesi + audit).
 * Geriye uyumlu imza: güncellenmiş savaş ya da (aktif değil / zaten ödenmiş) null.
 */
export async function finishSquadBattle(battleId: string) {
  const settled = await settleSquadBattle(battleId);
  return settled ? settled.battle : null;
}

/**
 * Onur Listesi Yönetimi
 */
export async function toggleHallOfFame(userId: string, status: boolean) {
  return await prisma.user.update({
    where: { id: userId },
    data: { isHallOfFame: status },
  });
}

/**
 * Klan Sandığına Puan Ekle
 */
export async function addToSquadTreasury(
  userId: string,
  points: number,
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  const membership = await db.squadMember.findFirst({
    where: { userId },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    select: { squadId: true },
  });

  if (membership) {
    // Klan gücü payı — oran TEK kaynaktan (lib/squads/rules); sayfa metni de oradan okur.
    const treasuryShare = Math.ceil(points * SQUAD_POWER_SHARE);
    // Dondurulmuş (askıdaki) klan güç biriktirmez (admin_squads Bulgu 1); üyenin kişisel puanı etkilenmez.
    const r = await db.squad.updateMany({
      where: { id: membership.squadId, isFrozen: false },
      data: { treasuryPoints: { increment: treasuryShare } },
    });
    return r.count > 0 ? treasuryShare : 0;
  }
  return 0;
}

/**
 * Aktif klan savaşı skoruna katkı. Kullanıcı puan kazandığında çağrılır:
 * klanı şu an AKTİF bir savaştaysa, kullanıcının katılımcı skorunu ve savaşın
 * ilgili klan skorunu (squad1Score/squad2Score) artırır. Önceden bu skor hiç
 * birikmiyordu (her zaman 0) — savaş "tamamlanma"da rastgele kazanan çıkıyordu.
 *
 * Kadro savaş KABULÜNDE donar (customer_squads.md Bulgu 6):
 *  - Katılımcı satırı varsa skor yalnız aynı klan için yazılır; savaş ortasında rakip klana
 *    geçen kullanıcının puanı hiçbir tarafa sayılmaz (eski klanından pay da alamaz).
 *  - Satır yoksa yalnız kabulden (`acceptedAt`, yoksa `startTime`) ÖNCE katılmış üye için
 *    oluşturulur; son dakikada kazanan klana katılan biri skor/ödül payı kazanamaz.
 * Hata-toleranslı tutulması çağıran tarafın sorumluluğunda (puan akışını bozmasın).
 */
export async function addToActiveBattleScore(
  userId: string,
  points: number,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  if (points <= 0) return 0;

  const membership = await db.squadMember.findFirst({
    where: { userId },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    select: { squadId: true, joinedAt: true },
  });
  if (!membership) return 0;

  const now = new Date();
  const battle = await db.squadBattle.findFirst({
    where: {
      status: 'active',
      startTime: { lte: now },
      endTime: { gt: now },
      OR: [{ squad1Id: membership.squadId }, { squad2Id: membership.squadId }],
    },
    select: { id: true, squad1Id: true, squad2Id: true, acceptedAt: true, startTime: true },
  });
  if (!battle) return 0;

  const isSquad1 = battle.squad1Id === membership.squadId;

  const participant = await db.squadBattleParticipant.findUnique({
    where: { battleId_userId: { battleId: battle.id, userId } },
    select: { squadId: true },
  });
  if (participant) {
    if (participant.squadId !== membership.squadId) return 0;
    await db.squadBattleParticipant.update({
      where: { battleId_userId: { battleId: battle.id, userId } },
      data: { score: { increment: points } },
    });
  } else {
    const rosterLockedAt = battle.acceptedAt ?? battle.startTime;
    if (membership.joinedAt && membership.joinedAt.getTime() > rosterLockedAt.getTime()) return 0;
    await db.squadBattleParticipant.create({
      data: { battleId: battle.id, squadId: membership.squadId, userId, score: points },
    });
  }

  // Savaşın ilgili klan toplam skorunu artır.
  await db.squadBattle.update({
    where: { id: battle.id },
    data: isSquad1
      ? { squad1Score: { increment: points } }
      : { squad2Score: { increment: points } },
  });

  return points;
}
