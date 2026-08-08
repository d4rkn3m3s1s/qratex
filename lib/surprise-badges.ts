/**
 * Sürpriz rozet otomatik-award: hiddenUntilEarned=true rozetler müşteriye GİZLİ olduğu
 * için "kazan" butonuyla alınamaz — koşulu sağlanınca SUNUCU otomatik verir + bildirim
 * ("sürpriz rozet kazandın!"). Feedback/consumption/streak gibi olaylardan sonra fire-and-forget
 * çağrılır. İdempotent: zaten sahip olunan rozet tekrar verilmez (unique guard).
 *
 * Karakter (dizi) rozetleri buraya DAHİL DEĞİL — onların kendi AI-tabanlı akışı var
 * (character-badges). Bu yalnız requirement-tabanlı gizli rozetler içindir.
 */
import { prisma } from '@/lib/prisma';

/** Bir kullanıcının requirement değerlendirmesi için sayaçları (tek okuma). */
export interface UserBadgeCounters {
  feedbackCount: number;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  level: number;
  referralCount: number;
  questsCompleted: number;
}

/** requirement tipine karşılık gelen sayaç değeri. -1 = otomatik verilemez (custom). */
function counterFor(type: string, c: UserBadgeCounters): number {
  switch (type) {
    case 'feedback_count':
    // Katalogdaki feedback varyantları (detaylı/uzun/faydalı) ayrı sayaç tutmuyor;
    // hepsi toplam yorum sayısına eşlenir (en azından koşul sağlanınca sürpriz açılır).
    case 'detailed_feedback_count':
    case 'long_feedback_count':
    case 'helpful_feedback':
      return c.feedbackCount;
    case 'points': return c.totalPoints;
    case 'streak': return c.currentStreak;
    case 'longest_streak': return c.longestStreak;
    case 'level': return c.level;
    case 'referral': return c.referralCount;
    case 'quests': return c.questsCompleted;
    default: return -1; // custom/bilinmeyen → otomatik verilemez
  }
}

/** Kullanıcının güncel sayaçlarını toplar. */
export async function loadUserBadgeCounters(userId: string): Promise<UserBadgeCounters> {
  const [user, feedbackCount, referralCount, questsCompleted] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { points: true, level: true, loginStreakCount: true, loginStreakLongest: true },
    }),
    prisma.feedback.count({ where: { userId } }).catch(() => 0),
    prisma.referral.count({ where: { referrerId: userId, status: 'COMPLETED' } }).catch(() => 0),
    prisma.userQuest.count({ where: { userId, completedAt: { not: null } } }).catch(() => 0),
  ]);
  return {
    feedbackCount,
    totalPoints: user?.points ?? 0,
    currentStreak: user?.loginStreakCount ?? 0,
    longestStreak: user?.loginStreakLongest ?? 0,
    level: user?.level ?? 1,
    referralCount,
    questsCompleted,
  };
}

/**
 * Kullanıcının HENÜZ SAHİP OLMADIĞI, hiddenUntilEarned=true + aktif rozetlerden requirement'ı
 * SAĞLANANLARI otomatik verir + "sürpriz rozet" bildirimi. Verilen rozet id'lerini döndürür.
 * Fire-and-forget çağrılmalı (hata akışı bozmaz).
 */
export async function awardEligibleSurpriseBadges(
  userId: string,
  counters?: UserBadgeCounters
): Promise<string[]> {
  try {
    const c = counters ?? (await loadUserBadgeCounters(userId));

    // Aday: gizli + aktif rozetler (küçük küme). Kullanıcının sahip olduklarını dışla.
    const [hidden, owned] = await Promise.all([
      prisma.badge.findMany({
        where: { hiddenUntilEarned: true, isActive: true },
        select: { id: true, name: true, requirement: true },
      }),
      prisma.userBadge.findMany({ where: { userId }, select: { badgeId: true } }),
    ]);
    const ownedSet = new Set(owned.map((o) => o.badgeId));

    const awarded: string[] = [];
    for (const badge of hidden) {
      if (ownedSet.has(badge.id)) continue;
      const req = (badge.requirement ?? {}) as { type?: string; value?: number };
      const type = typeof req.type === 'string' ? req.type : 'custom';
      const target = typeof req.value === 'number' ? req.value : 0;
      const have = counterFor(type, c);
      if (have < 0 || target <= 0) continue; // custom/bilinmeyen tip → otomatik verilemez
      if (have < target) continue; // koşul sağlanmadı

      // Atomik ver (unique guard → çift verilmez) + sürpriz bildirimi.
      const res = await prisma.userBadge.createMany({
        data: [{ userId, badgeId: badge.id }],
        skipDuplicates: true,
      });
      if (res.count === 0) continue; // yarış: başka istek verdi
      awarded.push(badge.id);
      await prisma.notification.create({
        data: {
          userId,
          type: 'badge',
          title: '🎉 Sürpriz rozet kazandın!',
          message: `Gizli bir rozet açıldı: ${badge.name}`,
          data: { kind: 'surprise-badge', href: '/customer/badges' } as object,
        },
      }).catch(() => {});
    }
    return awarded;
  } catch (err) {
    console.error('[SURPRISE_BADGE] award failed:', err);
    return [];
  }
}
