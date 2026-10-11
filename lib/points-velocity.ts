/**
 * Leaderboard anti-cheat: anormal hızda puan artışı tespiti.
 * Son 24 saat points_credited toplamı eşik aşımında suspicious flag.
 *
 * Kategori ayrımı (oyun-ekosistemi K2): mini oyun puanı sunucu doğrulamalı ve kendi
 * tavanına (lib/economy/caps GAME_DAILY_CAP) tabi; turnuva ödülü sunucunun dondurduğu
 * sıradan tek seferlik. Bunlar genel 500/24s eşiğine SAYILMAZ — eskiden 4 oyunu dürüstçe
 * kazanan oyuncu (4 × 150) genel liderlikte "şüpheli" işaretleniyordu. Oyun kovası yalnız
 * tavanın kendisini aşarsa (24 saatlik pencere iki UTC gününe yayılabilir → 2 × günlük
 * tavan) şüphelidir: bu dürüst oyunla imkânsızdır, tavan atlatma/hata işaretidir.
 */
import { prisma } from '@/lib/prisma';
import { GAME_DAILY_CAP } from '@/lib/economy/caps';

const HOURS = 24;
const THRESHOLD = 500; // 24 saatte 500+ puan şüpheli (oyun/turnuva hariç)

/** Kendi tavanı olan oyun kovası: 24 saatte bunu AŞAN şüphelidir. */
const GAME_BUCKET_LIMIT = 2 * GAME_DAILY_CAP;
const GAME_CATEGORIES: ReadonlySet<string> = new Set(['game']);
/** Sunucunun belirlediği tek seferlik ödüller — hız eşiğine sayılmaz. */
const EXEMPT_CATEGORIES: ReadonlySet<string> = new Set(['tournament']);

type VelocityEvent = { category?: string | null; data: unknown };

function pointsOf(data: unknown): number {
  const d = data as { points?: number } | null;
  return d && typeof d.points === 'number' ? d.points : 0;
}

/** Olayları genel / oyun kovalarına ayırır. */
function bucketize(events: readonly VelocityEvent[]): { general: number; game: number } {
  let general = 0;
  let game = 0;
  for (const e of events) {
    const p = pointsOf(e.data);
    if (!p) continue;
    const c = e.category ?? '';
    if (EXEMPT_CATEGORIES.has(c)) continue;
    if (GAME_CATEGORIES.has(c)) game += p;
    else general += p;
  }
  return { general, game };
}

function isSuspiciousBuckets(b: { general: number; game: number }): boolean {
  return b.general >= THRESHOLD || b.game > GAME_BUCKET_LIMIT;
}

/** Son 24 saatte kredilenen TOPLAM puan (tüm kategoriler; görünürlük için). */
export async function getPointsDelta24h(userId: string): Promise<number> {
  const since = new Date();
  since.setHours(since.getHours() - HOURS);

  const events = await prisma.analyticsEvent.findMany({
    where: {
      userId,
      event: 'points_credited',
      createdAt: { gte: since },
    },
    select: { data: true },
  });

  let total = 0;
  for (const e of events) total += pointsOf(e.data);
  return total;
}

export async function isSuspiciousPoints(userId: string): Promise<boolean> {
  const since = new Date();
  since.setHours(since.getHours() - HOURS);
  const events = await prisma.analyticsEvent.findMany({
    where: { userId, event: 'points_credited', createdAt: { gte: since } },
    select: { category: true, data: true },
  });
  return isSuspiciousBuckets(bucketize(events));
}

/**
 * Birden çok kullanıcı için şüpheli puan tespitini TEK sorguda yapar.
 * Leaderboard'da N kullanıcı için N ayrı findMany (N+1) yerine kullanılır.
 * @@index([userId, event, createdAt]) ile desteklenir.
 */
export async function getSuspiciousUserIds(userIds: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  if (userIds.length === 0) return result;

  const since = new Date();
  since.setHours(since.getHours() - HOURS);

  const events = await prisma.analyticsEvent.findMany({
    where: {
      userId: { in: userIds },
      event: 'points_credited',
      createdAt: { gte: since },
    },
    select: { userId: true, category: true, data: true },
  });

  const byUser = new Map<string, VelocityEvent[]>();
  for (const e of events) {
    if (!e.userId) continue;
    const list = byUser.get(e.userId) ?? [];
    list.push(e);
    byUser.set(e.userId, list);
  }
  for (const [uid, list] of byUser) {
    if (isSuspiciousBuckets(bucketize(list))) result.add(uid);
  }
  return result;
}
