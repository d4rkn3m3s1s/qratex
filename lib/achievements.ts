import { prisma } from './prisma';
import { rewardQuestOnce } from './quests/reward';

/**
 * Seed specific special achievements if they don't exist
 */
export async function seedAchievements() {
  const achievements = [
    {
      id: 'quest-color-wizard',
      name: 'Renk Sihirbazı',
      description: 'Avatar çerçevenizin rengini özelleştirin.',
      icon: '🎨',
      type: 'SPECIAL',
      requirement: { count: 1 },
      reward: { points: 50, xp: 100 },
    },
    {
      id: 'quest-gift-master',
      name: 'Hediye Ustası',
      description: 'Bir arkadaşınıza avatar çerçevesi veya profil arka planı hediye edin.',
      icon: '🎁',
      type: 'SPECIAL',
      requirement: { count: 1 },
      reward: { points: 100, xp: 200 },
    },
    {
      id: 'quest-cosmetic-collector',
      name: 'Koleksiyoncu',
      description: 'Mağazadan kendiniz için 3 adet kozmetik ürün satın alın.',
      icon: '🛍️',
      type: 'SPECIAL',
      requirement: { count: 3 },
      reward: { points: 75, xp: 150 },
    },
    {
      id: 'quest-showcase-master',
      name: 'Vitrin Ustası',
      description: 'Profil vitrininize en az 3 adet rozet veya çerçeve iğneleyin.',
      icon: '✨',
      type: 'SPECIAL',
      requirement: { count: 3 },
      reward: { points: 25, xp: 50 },
    },
  ];

  for (const ach of achievements) {
    await prisma.quest.upsert({
      where: { id: ach.id },
      update: {
        name: ach.name,
        description: ach.description,
        icon: ach.icon,
        type: ach.type,
        requirement: ach.requirement,
        reward: ach.reward,
      },
      create: {
        id: ach.id,
        name: ach.name,
        description: ach.description,
        icon: ach.icon,
        type: ach.type,
        requirement: ach.requirement,
        reward: ach.reward,
        isActive: true,
      },
    });
  }
}

/**
 * Başarım ilerlemesini artırır ya da ayarlar; hedefe ulaşınca ödülü OTOMATİK öder.
 *
 * Yarış güvenliği (P0-15): ilerleme okuması ve yazımı satır kilidi (`FOR UPDATE`) altında
 * yapılır — eşzamanlı iki çağrı aynı ilerlemeyi okuyup birbirinin artışını ezemez ve ikisi de
 * "tamamlandı" görüp çift ödeme yapamaz. Ödeme `rewardQuestOnce` ile tek seferlik
 * (`completedAt: null` + `rewardedAt: null` guard'ı, mintPoints defteri). Bu görevler otomatik
 * ödendiği için claim ucu onları ödemez (lib/quests/reward.ts → ACHIEVEMENT_QUEST_IDS).
 */
export async function advanceAchievementProgress(
  userId: string,
  questId: string,
  amount: number = 1,
  mode: 'increment' | 'set' = 'increment'
) {
  try {
    const quest = await prisma.quest.findUnique({
      where: { id: questId, isActive: true },
    });

    if (!quest || quest.archivedAt) return;

    const requirement = (quest.requirement || {}) as { count?: number };
    const target = typeof requirement.count === 'number' && requirement.count > 0 ? requirement.count : 1;
    const step = Number.isFinite(amount) ? Math.floor(amount) : 0;

    // Satır yoksa oluştur (idempotent; yarışta unique guard).
    const userQuest = await prisma.userQuest.upsert({
      where: {
        userId_questId: { userId, questId },
      },
      update: {},
      create: {
        userId,
        questId,
        progress: 0,
      },
      select: { id: true, completedAt: true },
    });

    if (userQuest.completedAt) {
      // Zaten tamamlandı (ve ödendi).
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Satır kilidi: bundan sonraki okuma eşzamanlı çağrıların commit'lenmiş sonucunu görür.
      await tx.$queryRaw`SELECT id FROM "UserQuest" WHERE id = ${userQuest.id} FOR UPDATE`;
      const fresh = await tx.userQuest.findUnique({
        where: { id: userQuest.id },
        select: { progress: true, completedAt: true },
      });
      if (!fresh || fresh.completedAt) return;

      let newProgress = mode === 'increment' ? fresh.progress + step : step;
      if (newProgress < 0) newProgress = 0;

      if (newProgress < target) {
        await tx.userQuest.update({
          where: { id: userQuest.id },
          data: { progress: newProgress },
        });
        return;
      }

      const rewards = (quest.reward || {}) as { points?: number; xp?: number };
      const rewardPoints = Math.max(0, Math.floor(Number(rewards.points) || 0));
      const rewardXp = Math.max(0, Math.floor(Number(rewards.xp) || 0));

      const paid = await rewardQuestOnce(tx, {
        userQuestId: userQuest.id,
        userId,
        questId,
        points: rewardPoints,
        xp: rewardXp,
        source: 'achievement',
        requireIncomplete: true,
        progress: newProgress,
      });
      if (!paid.rewarded) return;

      await tx.notification.create({
        data: {
          userId,
          title: `🏆 Başarım Kazanıldı: ${quest.name}!`,
          message: `"${quest.description}" başarımını tamamladınız! +${rewardPoints} Puan ve +${rewardXp} XP kazandınız.`,
          type: 'success',
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'COMPLETED_ACHIEVEMENT',
          entity: 'UserQuest',
          entityId: userQuest.id,
          newData: {
            questId,
            questName: quest.name,
            points: rewardPoints,
            xp: rewardXp,
          },
        },
      });
    });
  } catch (error) {
    console.error(`Error advancing achievement progress (${questId}) for user (${userId}):`, error);
  }
}
