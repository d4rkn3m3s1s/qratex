/**
 * Sürpriz rozet otomatik-award. TAM SÜRPRİZ POLİTİKASI: müşteri hiçbir rozeti önden
 * görmez, "kazan"/"satın al" butonu yok — koşulu (requirement) sağlanınca SUNUCU otomatik
 * verir + "sürpriz rozet kazandın!" bildirimi. Feedback/consumption/streak gibi olaylardan
 * sonra fire-and-forget çağrılır. İdempotent (unique guard).
 *
 * TÜM requirement-tabanlı aktif rozetler adaydır. Karakter (dizi) rozetleri DAHİL DEĞİL —
 * onların kendi AI-tabanlı akışı var (character-badges).
 *
 * SAYAÇ EŞLEME: 35 "ölü" rozet tipinin çoğu gerçek verilerle izlenebilir (5-yıldız, gece,
 * foto, profil, sürpriz kutu, işletme sayısı, hall-of-fame...). counterFor bunları gerçek
 * sayaca bağlar; ölçülemeyenler feedback_count'a yaklaşık eşlenir; hiç izlenemeyenler -1.
 */
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/** Bir kullanıcının requirement değerlendirmesi için sayaçları (tek okuma). */
export interface UserBadgeCounters {
  feedbackCount: number;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  level: number;
  referralCount: number;
  questsCompleted: number;
  // ── Gerçek-veri sayaçları (35 rozet canlandırma) ──
  fiveStarCount: number;      // 5 yıldızlı yorum
  lowRatingCount: number;     // <=2 yıldız (düşük/kritik)
  positiveCount: number;      // sentiment=positive
  photoCount: number;         // medya (fotoğraf) içeren yorum
  nightCount: number;         // gece (00-06, TR saati) yorum
  surpriseOpenedCount: number;// açılmış sürpriz kutu
  profileComplete: number;    // 0/1 — name+image+phone+biography dolu
  accountAgeDays: number;     // hesap yaşı (gün)
  chatMessagesCount: number;  // QraChatLog mesaj sayısı
  activeDays: number;         // UserStreak.totalActiveDays
  uniqueBusinesses: number;   // tüketim yapılan farklı işletme
  revisitBusinesses: number;  // >1 kez tüketim yapılan işletme
  leaderboardTop: number;     // 0/1 — isHallOfFame
  emojiCount: number;         // emoji içeren yorum
}

/**
 * requirement tipine karşılık gelen sayaç değeri. -1 = otomatik verilemez (izlenemez/custom).
 * Grup 1 = TAM eşleme (gerçek sayaç); Grup 2 = YAKLAŞIK (feedback_count fallback);
 * Grup 3 = İZLENEMEZ (default -1, örn. liked_feedback/anonymous_feedback → pasiflenmeli).
 */
function counterFor(type: string, c: UserBadgeCounters): number {
  switch (type) {
    // ── Grup 1: TAM eşleme (gerçek sayaç) ──
    case 'feedback_count': return c.feedbackCount;
    case 'points':
    case 'total_points': return c.totalPoints; // total_points seed hatasını da kapatır
    case 'streak': return c.currentStreak;
    case 'longest_streak': return c.longestStreak;
    case 'level': return c.level;
    case 'referral': return c.referralCount;
    case 'quests': return c.questsCompleted;
    case 'five_star_count': return c.fiveStarCount;
    case 'low_rating_feedback':
    case 'critical_feedback': return c.lowRatingCount; // düşük-puan sayacını paylaşır
    case 'positive_feedback': return c.positiveCount;
    case 'photo_feedback': return c.photoCount;
    case 'night_feedback': return c.nightCount;
    case 'surprise_reward': return c.surpriseOpenedCount;
    case 'profile_complete': return c.profileComplete;
    case 'account_age_days': return c.accountAgeDays;
    case 'chat_messages': return c.chatMessagesCount;
    case 'active_days': return c.activeDays;
    case 'unique_businesses':
    case 'first_visit_feedback': return c.uniqueBusinesses; // >=1 → aynı distinct sayaç
    case 'revisit_business': return c.revisitBusinesses;
    case 'leaderboard_top': return c.leaderboardTop;
    case 'emoji_feedback': return c.emojiCount;

    // ── Grup 2: YAKLAŞIK — toplam yoruma fallback (ayrı metrik verisi yok) ──
    // (detaylı/uzun/faydalı + hız/yaratıcılık/etki türevleri; koşul sağlanınca sürpriz açılır)
    case 'detailed_feedback_count':
    case 'long_feedback_count':
    case 'helpful_feedback':
    case 'quick_feedback':
    case 'rapid_feedback':
    case 'ultra_fast_feedback':
    case 'efficient_feedback':
    case 'last_minute_feedback':
    case 'inspiring_feedback':
    case 'creative_suggestion':
    case 'community_impact':
    case 'unique_perspective':
    case 'hidden_detail':
    case 'dramatic_feedback':
    case 'funny_feedback':
    case 'honest_feedback':
    case 'cafe_feedback':
    case 'food_category_count':
    // İzlenemez (beğeni/anonim verisi yok) ama "asla açılmayan rozet" kötü deneyim →
    // toplam yoruma yaklaşık bağla (Furkan: tüm rozetler kazanılabilir olsun).
    case 'liked_feedback':
    case 'anonymous_feedback':
      return c.feedbackCount;
    case 'milestone_reached': return c.feedbackCount > 0 ? 1 : 0; // ilk kilometre taşı (0/1)

    // ── Bilinmeyen/custom tip → otomatik verilemez ──
    default: return -1;
  }
}

/** Emoji içeren yorum sayısı (kod tarafı — emoji regex). */
function countEmojiTexts(texts: (string | null)[]): number {
  const emojiRe = /\p{Extended_Pictographic}/u;
  return texts.filter((t) => t && emojiRe.test(t)).length;
}

/** Kullanıcının güncel sayaçlarını toplar (tek turda paralel). */
export async function loadUserBadgeCounters(userId: string): Promise<UserBadgeCounters> {
  // Gece penceresi (TR saati 00-06). Prisma'da saat filtresi yok → $queryRaw.
  const nightQuery = prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM "Feedback"
    WHERE "userId" = ${userId} AND "deletedAt" IS NULL
      AND EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'Europe/Istanbul')) < 6
  `.then((r) => Number(r?.[0]?.n ?? 0)).catch(() => 0);

  const [
    user, feedbackCount, referralCount, questsCompleted,
    fiveStarCount, lowRatingCount, positiveCount,
    surpriseOpenedCount, chatMessagesCount, userStreak,
    feedbackTexts, consumptions, nightCount,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        points: true, level: true, loginStreakCount: true, loginStreakLongest: true,
        name: true, image: true, phone: true, biography: true, createdAt: true, isHallOfFame: true,
      },
    }),
    prisma.feedback.count({ where: { userId, deletedAt: null } }).catch(() => 0),
    prisma.referral.count({ where: { referrerId: userId, status: 'COMPLETED' } }).catch(() => 0),
    prisma.userQuest.count({ where: { userId, completedAt: { not: null } } }).catch(() => 0),
    prisma.feedback.count({ where: { userId, deletedAt: null, rating: 5 } }).catch(() => 0),
    prisma.feedback.count({ where: { userId, deletedAt: null, rating: { lte: 2 } } }).catch(() => 0),
    prisma.feedback.count({ where: { userId, deletedAt: null, sentiment: 'positive' } }).catch(() => 0),
    prisma.userSurpriseBox.count({ where: { userId, openedAt: { not: null } } }).catch(() => 0),
    prisma.qraChatLog.count({ where: { userId } }).catch(() => 0),
    prisma.userStreak.findUnique({ where: { userId }, select: { totalActiveDays: true } }).catch(() => null),
    // Foto (media dolu) + emoji için metin/media örneklemi (tek çekim).
    prisma.feedback.findMany({ where: { userId, deletedAt: null }, select: { text: true, media: true } }).catch(() => [] as { text: string | null; media: Prisma.JsonValue }[]),
    // İşletme çeşitliliği + tekrar-ziyaret için tüketimler.
    prisma.consumption.findMany({ where: { customerId: userId }, select: { dealerId: true } }).catch(() => [] as { dealerId: string }[]),
    nightQuery,
  ]);

  // Foto: media dizisi dolu olan yorum sayısı.
  const photoCount = feedbackTexts.filter((f) => {
    const m = f.media;
    return Array.isArray(m) ? m.length > 0 : !!m && typeof m === 'object';
  }).length;
  const emojiCount = countEmojiTexts(feedbackTexts.map((f) => f.text));

  // İşletme çeşitliliği + tekrar ziyaret.
  const dealerCounts = new Map<string, number>();
  for (const c of consumptions) dealerCounts.set(c.dealerId, (dealerCounts.get(c.dealerId) ?? 0) + 1);
  const uniqueBusinesses = dealerCounts.size;
  let revisitBusinesses = 0;
  for (const n of dealerCounts.values()) if (n > 1) revisitBusinesses++;

  // Profil tamamlanma (0/1) + hesap yaşı + hall-of-fame.
  const profileComplete = user?.name && user?.image && user?.phone && user?.biography ? 1 : 0;
  const accountAgeDays = user?.createdAt
    ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000)
    : 0;

  return {
    feedbackCount,
    totalPoints: user?.points ?? 0,
    currentStreak: user?.loginStreakCount ?? 0,
    longestStreak: user?.loginStreakLongest ?? 0,
    level: user?.level ?? 1,
    referralCount,
    questsCompleted,
    fiveStarCount,
    lowRatingCount,
    positiveCount,
    photoCount,
    nightCount,
    surpriseOpenedCount,
    profileComplete,
    accountAgeDays,
    chatMessagesCount,
    activeDays: userStreak?.totalActiveDays ?? 0,
    uniqueBusinesses,
    revisitBusinesses,
    leaderboardTop: user?.isHallOfFame ? 1 : 0,
    emojiCount,
  };
}

/**
 * Kullanıcının HENÜZ SAHİP OLMADIĞI aktif rozetlerden requirement'ı SAĞLANANLARI otomatik
 * verir + "sürpriz rozet" bildirimi. Verilen rozet id'lerini döndürür. Fire-and-forget.
 */
export async function awardEligibleSurpriseBadges(
  userId: string,
  counters?: UserBadgeCounters
): Promise<string[]> {
  try {
    const c = counters ?? (await loadUserBadgeCounters(userId));

    // Aday: TÜM aktif rozetler. Karakter (dizi) rozetleri hariç — kendi AI akışı var.
    const { CHARACTER_PROFILES } = await import('@/lib/character-badges');
    const charIds = new Set(CHARACTER_PROFILES.map((p) => p.badgeId));
    const [candidates, owned] = await Promise.all([
      prisma.badge.findMany({
        where: { isActive: true },
        select: { id: true, name: true, requirement: true },
      }),
      prisma.userBadge.findMany({ where: { userId }, select: { badgeId: true } }),
    ]);
    const ownedSet = new Set(owned.map((o) => o.badgeId));

    const awarded: string[] = [];
    for (const badge of candidates) {
      if (ownedSet.has(badge.id)) continue;
      if (charIds.has(badge.id)) continue; // dizi karakteri → kendi akışı (character-badges)
      const req = (badge.requirement ?? {}) as { type?: string; value?: number };
      const type = typeof req.type === 'string' ? req.type : 'custom';
      const target = typeof req.value === 'number' ? req.value : 0;
      const have = counterFor(type, c);
      if (have < 0 || target <= 0) continue; // izlenemez/custom → otomatik verilemez
      if (have < target) continue; // koşul sağlanmadı

      // Rozet ekleme + ödül kredisi AYNI TRANSACTION'da ([[points-economy-invariants]]):
      // ayrı tx'lerde yapılırsa kredi hatasında rozet kalıcı verilmiş ama puan yatmamış
      // olur ve sonraki çağrıda count=0 döneceği için kredi BİR DAHA denenmez (puan kaybı).
      // Tek tx: kredi patlarsa rozet de rollback → tutarsız durum yok, sonraki koşuda tekrar denenir.
      const { creditBadgeRewardInTx } = await import('@/lib/badge-reward-points');
      const outcome = await prisma.$transaction(async (tx) => {
        const res = await tx.userBadge.createMany({
          data: [{ userId, badgeId: badge.id }],
          skipDuplicates: true, // unique guard → çift verilmez
        });
        if (res.count === 0) return { created: false, points: 0 }; // yarış: başka istek verdi
        const p = await creditBadgeRewardInTx(tx as never, {
          userId, badgeId: badge.id, badgeName: badge.name, justCreated: true,
        });
        return { created: true, points: p };
      }).catch((e: unknown) => {
        // Sessiz yutma yok: rozet verilemediyse görünür olsun (rollback ile durum tutarlı).
        console.error('[SURPRISE_BADGE] award tx failed:', badge.id, e);
        return { created: false, points: 0 };
      });

      if (!outcome.created) continue;
      awarded.push(badge.id);
      const rewarded = outcome.points;

      await prisma.notification.create({
        data: {
          userId,
          type: 'badge',
          title: '🎉 Sürpriz rozet kazandın!',
          message: rewarded > 0
            ? `Gizli bir rozet açıldı: ${badge.name} (+${rewarded} puan)`
            : `Gizli bir rozet açıldı: ${badge.name}`,
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
