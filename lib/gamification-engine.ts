import { prisma } from '@/lib/prisma';
import { triggerConfetti } from '@/lib/effects/confetti';

/**
 * Klan Savaşını Sonlandır ve Ödülleri Dağıt
 */
export async function finishSquadBattle(battleId: string) {
  return await prisma.$transaction(async (tx) => {
    // 1. Savaşı bul
    const battle = await tx.squadBattle.findUnique({
      where: { id: battleId },
      include: {
        participants: true,
        squad1: { select: { id: true, name: true } },
        squad2: { select: { id: true, name: true } },
      },
    });

    if (!battle) throw new Error('Savaş bulunamadı');
    if (battle.status === 'completed') throw new Error('Savaş zaten tamamlanmış');

    // 2. Kazananı belirle
    let winnerId = null;
    if (battle.squad1Score > battle.squad2Score) {
      winnerId = battle.squad1Id;
    } else if (battle.squad2Score > battle.squad1Score) {
      winnerId = battle.squad2Id;
    } else {
      // Beraberlik durumu (her iki klan da küçük bir ödül alabilir veya kimse almaz)
      winnerId = null; 
    }

    // 3. Ödülleri dağıt
    if (winnerId && battle.rewardPool > 0) {
      const winnerParticipants = battle.participants.filter(p => p.squadId === winnerId);
      
      if (winnerParticipants.length > 0) {
        // Her katılımcıya eşit veya katkısına göre (score) dağıt
        // Şimdilik eşit dağıtalım
        const rewardPerPerson = Math.floor(battle.rewardPool / winnerParticipants.length);
        const xpPerPerson = Math.floor(rewardPerPerson * 0.5); // XP de verelim

        for (const participant of winnerParticipants) {
          // Kullanıcı puanını ve XP'sini güncelle
          await tx.user.update({
            where: { id: participant.userId },
            data: {
              points: { increment: rewardPerPerson },
              xp: { increment: xpPerPerson },
            },
          });

          // Bildirim gönder
          await tx.notification.create({
            data: {
              userId: participant.userId,
              title: 'Savaş Galibiyeti! ⚔️',
              message: `${battle.squad1.name} vs ${battle.squad2.name} savaşını kazandınız! ${rewardPerPerson} puan ve ${xpPerPerson} XP kazandınız.`,
              type: 'success',
            },
          });
        }
      }

      // Klan toplam puanını güncelle
      await tx.squad.update({
        where: { id: winnerId },
        data: { totalPoints: { increment: battle.rewardPool } },
      });
    }

    // 4. Savaşı güncelle
    const updatedBattle = await tx.squadBattle.update({
      where: { id: battleId },
      data: {
        status: 'completed',
        winnerId,
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
export async function addToSquadTreasury(userId: string, points: number) {
  const membership = await prisma.squadMember.findFirst({
    where: { userId },
    select: { squadId: true },
  });

  if (membership) {
    const treasuryShare = Math.ceil(points * 0.1); // %10 sandığa
    await prisma.squad.update({
      where: { id: membership.squadId },
      data: { treasuryPoints: { increment: treasuryShare } },
    });
    return treasuryShare;
  }
  return 0;
}
