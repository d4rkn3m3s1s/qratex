import { prisma } from './prisma';
import { creditPointsAndXp } from './points-wallet';

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
 * Increment or set progress for a specific achievement
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

    if (!quest) return;

    const requirement = (quest.requirement || {}) as { count?: number };
    const target = typeof requirement.count === 'number' && requirement.count > 0 ? requirement.count : 1;

    // Get current progress or create
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
    });

    if (userQuest.completedAt) {
      // Already completed
      return;
    }

    let newProgress = mode === 'increment' ? userQuest.progress + amount : amount;
    if (newProgress < 0) newProgress = 0;

    const isNowCompleted = newProgress >= target;

    await prisma.$transaction(async (tx) => {
      // Update progress
      await tx.userQuest.update({
        where: { id: userQuest.id },
        data: {
          progress: newProgress,
          ...(isNowCompleted && { completedAt: new Date() }),
        },
      });

      if (isNowCompleted) {
        // Parse rewards
        const rewards = (quest.reward || {}) as { points?: number; xp?: number };
        const rewardPoints = Number(rewards.points) || 0;
        const rewardXp = Number(rewards.xp) || 0;

        // Credit points & XP
        await creditPointsAndXp(tx, {
          userId,
          points: rewardPoints,
          xp: rewardXp,
        });

        // Anti-fraud görünürlüğü: kredilenen puanı points_credited olarak işle (aynı tx).
        if (rewardPoints > 0) {
          await tx.analyticsEvent.create({
            data: {
              userId,
              event: 'points_credited',
              category: 'achievement',
              data: { points: rewardPoints, questId: quest.id },
            },
          });
        }

        // Add notification
        await tx.notification.create({
          data: {
            userId,
            title: `🏆 Başarım Kazanıldı: ${quest.name}!`,
            message: `"${quest.description}" başarımını tamamladınız! +${rewardPoints} Puan ve +${rewardXp} XP kazandınız.`,
            type: 'success',
          },
        });

        // Log audit
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
      }
    });
  } catch (error) {
    console.error(`Error advancing achievement progress (${questId}) for user (${userId}):`, error);
  }
}
