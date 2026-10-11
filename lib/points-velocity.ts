/**
 * Puan hızı anomalisi — anormal hızda puan artışı tespiti (TEK tanım).
 * Son 24 saat `points_credited` toplamı eşik aşımında şüpheli.
 *
 * Tüketiciler: Güven Merkezi taraması (`lib/admin-trust/trust.server.ts` → POINTS_VELOCITY vakası;
 * eşik yöneticinin kuralından, kategori ayrımı buradan) ve bu modülün kullanıcı bazlı yardımcıları.
 * (Eski `/api/leaderboard` emekli — liderlik lib/league-board, fraud durumu temiz olmayanı dışlar.)
 *
 * Kategori ayrımı:
 *  - Oyun (oyun-ekosistemi K2): sunucu doğrulamalı ve kendi tavanına (GAME_DAILY_CAP) tabi; genel
 *    eşiğe SAYILMAZ — 4 oyunu dürüstçe kazanan (4 × 150) "şüpheli" olmamalı. Oyun kovası yalnız
 *    tavanın kendisini aşarsa (24 saatlik pencere iki UTC gününe yayılabilir → 2 × günlük tavan)
 *    şüphelidir: dürüst oyunla imkânsız, tavan atlatma/hata işaretidir.
 *  - Muaf (oyunlaştırma-ekonomi Y4): sunucunun belirlediği TEK SEFERLİK ödüller (rozet 2.500–10.000,
 *    davet, görev, seri taşı, turnuva, sezon, doğum günü) ve kullanıcının kendi puanının iadesi /
 *    transferi (escrow iadesi, savaş havuzu, ödül iadesi, moderasyon iadesi, admin düzeltmesi,
 *    açılış bakiyesi). Bunlar eşiğe sayılınca karakter rozeti açan her dürüst müşteri Güven
 *    Merkezi'nde YÜKSEK önemli "puan hızı" vakası üretiyordu. Bilinmeyen (yeni) kaynak SAYILIR
 *    (tespit tarafında güvenli varsayılan).
 */
import { prisma } from '@/lib/prisma';
import { GAME_DAILY_CAP } from '@/lib/economy/caps';

const HOURS = 24;
const THRESHOLD = 500; // 24 saatte 500+ puan şüpheli (oyun/muaf kategoriler hariç)

/** Kendi tavanı olan oyun kovası: 24 saatte bunu AŞAN şüphelidir. */
export const VELOCITY_GAME_BUCKET_LIMIT = 2 * GAME_DAILY_CAP;
const GAME_BUCKET_LIMIT = VELOCITY_GAME_BUCKET_LIMIT;
export const VELOCITY_GAME_CATEGORIES: readonly string[] = ['game'];
const GAME_CATEGORIES: ReadonlySet<string> = new Set(VELOCITY_GAME_CATEGORIES);
/** Hız eşiğine sayılmayan `points_credited.category` değerleri (tek seferlik + iade/transfer). */
export const VELOCITY_EXEMPT_CATEGORIES: readonly string[] = [
  // tek seferlik, sunucu belirler
  'tournament',
  'badge',
  'referral',
  'referral_milestone',
  'quest',
  'game_quest',
  'game_streak',
  'streak',
  'seasonal_challenge',
  'birthday',
  'squad',
  // kullanıcının kendi puanının iadesi / transfer / yönetici
  'squad_battle',
  'squad_escrow_refund',
  'reward_refund',
  'reversal',
  'admin_adjust',
  'opening_balance',
  'demo_seed',
];
const EXEMPT_CATEGORIES: ReadonlySet<string> = new Set(VELOCITY_EXEMPT_CATEGORIES);
/**
 * "Muaf" kategoriler genel eşikten muaftır ama tespitten DEĞİL: kendi kovalarında toplanır ve
 * bu tavanı aşarsa şüphelidir. Tek bir dürüst günde en büyük tek seferlik ödül (efsanevi rozet
 * 10.000) + birkaç küçük ödül/iade bunun çok altında kalır; sınırsız tekrarlanabilen kaynaklar
 * (sahte hesaplarla davet çiftliği, danışıklı savaş kazancı, içeriden admin_adjust, iade döngüsü)
 * ise tamamen görünmez olmamalı (güvenlik incelemesi: tam muafiyet tespiti kapatıyordu).
 */
export const VELOCITY_ONE_OFF_BUCKET_LIMIT = 25_000;

type VelocityEvent = { category?: string | null; data: unknown };

function pointsOf(data: unknown): number {
  const d = data as { points?: number } | null;
  return d && typeof d.points === 'number' ? d.points : 0;
}

/** Olayları genel / oyun kovalarına ayırır. */
function bucketize(events: readonly VelocityEvent[]): { general: number; game: number; oneOff: number } {
  let general = 0;
  let game = 0;
  let oneOff = 0;
  for (const e of events) {
    const p = pointsOf(e.data);
    if (!p) continue;
    const c = e.category ?? '';
    if (EXEMPT_CATEGORIES.has(c)) oneOff += p;
    else if (GAME_CATEGORIES.has(c)) game += p;
    else general += p;
  }
  return { general, game, oneOff };
}

/** @internal test için dışa açık. */
export function isSuspiciousBuckets(b: { general: number; game: number; oneOff?: number }): boolean {
  return b.general >= THRESHOLD || b.game > GAME_BUCKET_LIMIT || (b.oneOff ?? 0) > VELOCITY_ONE_OFF_BUCKET_LIMIT;
}

/** @internal test için dışa açık. */
export const __bucketizeForTest = bucketize;

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
