/**
 * Ben kabuğu — profil kartı verisi (sunucu). Bölüm bağlantıları kayıttan (`getShellConfig`)
 * gelir; burada yalnız kişisel özet: kim, ne zamandan beri, seviye, bakiye, seri, vitrin
 * karakteri ve bölüm ipuçları (rozet sayısı, bekleyen yorum).
 */
import { prisma } from '@/lib/prisma';
import { resolveAvatarImage } from '@/lib/avatar-options';
import { levelProgress } from '../level';
import { badgeColor, badgeVisual } from '../badge-visual';
import { streakStateOf } from './summary';

export type MeProfile = {
  name: string | null;
  image: string | null;
  memberSince: string;
  level: number;
  levelPercent: number;
  points: number;
  streak: number;
  /** Ekip modülünü görebilir mi (DB'deki ekip rolü ya da ADMIN). */
  canSeeTeam: boolean;
  featured: { name: string; imageSrc: string | null; emoji: string | null; rarity: string; color: string | null } | null;
  badgeCount: number | null;
  pendingReviews: number | null;
};

export async function getMeProfile(userId: string, now: Date = new Date()): Promise<MeProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      image: true,
      role: true,
      adminTeamRole: true,
      createdAt: true,
      level: true,
      xp: true,
      points: true,
      loginStreakCount: true,
      loginStreakLongest: true,
      loginStreakLastDay: true,
      featuredCharacterBadgeId: true,
    },
  });
  if (!user) return null;

  const [featured, badgeCount, pendingReviews] = await Promise.all([
    user.featuredCharacterBadgeId
      ? prisma.userBadge
          .findFirst({
            // Yalnız kullanıcının GERÇEKTEN kazandığı rozet vitrine çıkar.
            where: { userId, badgeId: user.featuredCharacterBadgeId },
            select: { badge: { select: { name: true, icon: true, rarity: true, color: true } } },
          })
          .catch((e) => {
            console.error('[me] vitrin rozeti okunamadı', e);
            return null;
          })
      : Promise.resolve(null),
    prisma.userBadge.count({ where: { userId } }).catch((e) => {
      console.error('[me] rozet sayısı okunamadı', e);
      return null;
    }),
    prisma.consumption.count({ where: { customerId: userId, review: null } }).catch((e) => {
      console.error('[me] bekleyen yorum sayısı okunamadı', e);
      return null;
    }),
  ]);

  const lp = levelProgress(user.xp, user.level);
  const streak = streakStateOf(user.loginStreakLastDay, user.loginStreakCount, user.loginStreakLongest, null, now);
  const fv = featured ? badgeVisual(featured.badge.icon) : null;

  return {
    name: user.name?.trim() || null,
    image: resolveAvatarImage(user.image),
    memberSince: user.createdAt.toISOString(),
    level: lp.level,
    levelPercent: lp.percent,
    points: Math.max(0, user.points),
    streak: streak.current,
    canSeeTeam: user.role === 'ADMIN' || !!user.adminTeamRole,
    featured:
      featured && fv
        ? {
            name: featured.badge.name,
            imageSrc: fv.imageSrc,
            emoji: fv.emoji,
            rarity: (featured.badge.rarity || 'common').toLowerCase(),
            color: badgeColor(featured.badge.color),
          }
        : null,
    badgeCount,
    pendingReviews,
  };
}
