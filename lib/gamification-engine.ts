import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { triggerConfetti } from '@/lib/effects/confetti';

/**
 * Klan Savaşını Sonlandır ve Ödülleri Dağıt
 */
export async function finishSquadBattle(battleId: string) {
  return await prisma.$transaction(async (tx) => {
    // 1. ATOMİK CLAIM: yalnızca hâlâ 'active' olan savaşı 'completed'a çevir.
    //    Üç ayrı sonlandırıcı (cron + inngest + admin) eşzamanlı çalışsa bile
    //    yalnızca BİRİ bu updateMany'i count=1 ile geçer; diğerleri count=0 alır
    //    ve hiçbir ödeme yapmaz (önceden status okunup koşulsuz update ediliyordu
    //    → çift/N-kat ödeme yarışı). Skor okuması da claim'den SONRA yapılır.
    const claimed = await tx.squadBattle.updateMany({
      where: { id: battleId, status: 'active' },
      data: { status: 'completed' },
    });
    if (claimed.count === 0) {
      // Zaten tamamlanmış / aktif değil — sessizce çık (idempotent).
      return null;
    }

    const battle = await tx.squadBattle.findUnique({
      where: { id: battleId },
      include: {
        participants: true,
        squad1: { select: { id: true, name: true } },
        squad2: { select: { id: true, name: true } },
      },
    });
    if (!battle) throw new Error('Savaş bulunamadı');

    // 2. Kazananı belirle
    let winnerId: string | null = null;
    if (battle.squad1Score > battle.squad2Score) {
      winnerId = battle.squad1Id;
    } else if (battle.squad2Score > battle.squad1Score) {
      winnerId = battle.squad2Id;
    } else {
      winnerId = null; // Beraberlik → kimse kazanmaz.
    }

    // 3. Ödülleri dağıt — YALNIZCA escrow ile FONLANMIŞ havuzdan (rewardFunded).
    //    Fonlanmamış (eski/admin) savaşlar puan BASMAZ; bedava-puan istismarı kapalı.
    const payoutPool = battle.rewardFunded ? battle.rewardPool : 0;
    let paidOut = 0;

    if (winnerId && payoutPool > 0) {
      const winnerParticipants = battle.participants.filter((p) => p.squadId === winnerId);

      if (winnerParticipants.length > 0) {
        const rewardPerPerson = Math.floor(payoutPool / winnerParticipants.length);
        const xpPerPerson = Math.floor(rewardPerPerson * 0.5);

        for (const participant of winnerParticipants) {
          if (rewardPerPerson > 0 || xpPerPerson > 0) {
            await creditPointsAndXp(tx, {
              userId: participant.userId,
              points: rewardPerPerson,
              xp: xpPerPerson,
            });
            // Anti-fraud görünürlüğü: kredilenen puanı points_credited olarak işle
            // (caps + velocity dedektörü bu olaya bakar — escrow ödemesi de sayılır).
            if (rewardPerPerson > 0) {
              await tx.analyticsEvent.create({
                data: {
                  userId: participant.userId,
                  event: 'points_credited',
                  category: 'squad_battle',
                  data: { points: rewardPerPerson, battleId: battle.id },
                },
              });
            }
          }

          await tx.notification.create({
            data: {
              userId: participant.userId,
              title: 'Savaş Galibiyeti! ⚔️',
              message: `${battle.squad1.name} vs ${battle.squad2.name} savaşını kazandınız! ${rewardPerPerson} puan ve ${xpPerPerson} XP kazandınız.`,
              type: 'success',
            },
          });
        }
        paidOut = rewardPerPerson * winnerParticipants.length;
      }

      // Klan toplam puanını yalnızca gerçekten dağıtılan kadar artır.
      if (paidOut > 0) {
        await tx.squad.update({
          where: { id: winnerId },
          data: { totalPoints: { increment: paidOut } },
        });
      }
    }

    // 4. Fonlanmış havuzdan dağıtılmayan kalanı (kazanan yok / bölme artığı /
    //    katılımcısız) meydan okuyana İADE et (escrow net-sıfır). Idempotent.
    const refundLeft = battle.rewardFunded ? battle.rewardPool - paidOut : 0;
    if (refundLeft > 0 && battle.challengedById && !battle.rewardRefunded) {
      await creditPointsAndXp(tx, {
        userId: battle.challengedById,
        points: refundLeft,
      });
      await tx.analyticsEvent.create({
        data: {
          userId: battle.challengedById,
          event: 'points_credited',
          category: 'squad_battle_refund',
          data: { points: refundLeft, battleId: battle.id },
        },
      });
    }

    // 5. Savaşı kazananla + iade bayrağıyla güncelle (status zaten 'completed').
    const updatedBattle = await tx.squadBattle.update({
      where: { id: battleId },
      data: {
        winnerId,
        rewardRefunded: battle.rewardFunded ? true : battle.rewardRefunded,
      },
    });

    return updatedBattle;
  });
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
