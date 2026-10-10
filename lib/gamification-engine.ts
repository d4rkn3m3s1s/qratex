import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { settleSquadBattle } from '@/lib/squad-battle-service';
import { triggerConfetti } from '@/lib/effects/confetti';

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
    select: { squadId: true },
  });

  if (membership) {
    const treasuryShare = Math.ceil(points * 0.1); // %10 sandığa
    await db.squad.update({
      where: { id: membership.squadId },
      data: { treasuryPoints: { increment: treasuryShare } },
    });
    return treasuryShare;
  }
  return 0;
}

/**
 * Aktif klan savaşı skoruna katkı. Kullanıcı puan kazandığında çağrılır:
 * klanı şu an AKTİF bir savaştaysa, kullanıcının katılımcı skorunu ve savaşın
 * ilgili klan skorunu (squad1Score/squad2Score) artırır. Önceden bu skor hiç
 * birikmiyordu (her zaman 0) — savaş "tamamlanma"da rastgele kazanan çıkıyordu.
 *
 * Katılımcı kaydı yoksa otomatik oluşturulur (savaşa katılım = klan üyeliği).
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
    select: { squadId: true },
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
    select: { id: true, squad1Id: true, squad2Id: true },
  });
  if (!battle) return 0;

  const isSquad1 = battle.squad1Id === membership.squadId;

  // Katılımcı skorunu artır (yoksa oluştur).
  await db.squadBattleParticipant.upsert({
    where: { battleId_userId: { battleId: battle.id, userId } },
    update: { score: { increment: points } },
    create: { battleId: battle.id, squadId: membership.squadId, userId, score: points },
  });

  // Savaşın ilgili klan toplam skorunu artır.
  await db.squadBattle.update({
    where: { id: battle.id },
    data: isSquad1
      ? { squad1Score: { increment: points } }
      : { squad2Score: { increment: points } },
  });

  return points;
}
