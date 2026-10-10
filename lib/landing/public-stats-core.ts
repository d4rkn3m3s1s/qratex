/**
 * Herkese açık vitrin istatistikleri — SAF çekirdek (DB istemcisi parametre).
 *
 * Denetim (docs/audit/2026-10-08/musteri/landing.md Bulgu 2-4) düzeltmeleri:
 *  - "Aktif kullanıcı" = tüm roller değil; yalnız gerçek TÜKETİCİ hesapları sayılır
 *    (rol CUSTOMER, demo değil, anonimleştirilmemiş, askıda değil). Etiket buna göre
 *    "Kayıtlı üye" — ölçü ile etiket aynı şeyi söyler.
 *  - Silinmiş (spam) geri bildirimler ve demo işletmelerin verisi sayıya/ortalamaya girmez.
 *  - Veri yoksa ortalama UYDURULMAZ (eski 4.9 yedeği kaldırıldı): örneklem
 *    `ratingSample` altındaysa `rating: null`.
 *  - Eşik altındaki metrikler vitrinde hiç gösterilmez (sahte "10K+" yerine dürüst sessizlik).
 */
import type { PrismaClient } from '@prisma/client';

export interface PublicStats {
  /** Gerçek tüketici hesabı sayısı. */
  members: number;
  /** Gerçek işletme (bayi) hesabı sayısı. */
  businesses: number;
  /** Silinmemiş, demo olmayan geri bildirim sayısı. */
  feedbacks: number;
  /** Aynı filtre, son 30 gün. */
  feedbacksLast30d: number;
  /** Ortalama puan (1-5, tek ondalık). Örneklem yetersizse null. */
  rating: number | null;
  /** Ortalamaya giren geri bildirim sayısı. */
  ratingCount: number;
  /** Hesaplama anı (ISO). */
  computedAt: string;
}

/** Vitrinde bir metriğin gösterilmesi için gereken en düşük değerler. */
export const PUBLIC_STATS_THRESHOLDS = {
  members: 50,
  businesses: 5,
  feedbacks: 50,
  feedbacksLast30d: 20,
  /** Ortalama puanın anlamlı sayılması için en az geri bildirim. */
  ratingSample: 30,
} as const;

export type PublicStatKey = 'members' | 'businesses' | 'feedbacks' | 'feedbacksLast30d' | 'rating';

export type StatsDb = Pick<PrismaClient, 'user' | 'feedback'>;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Gerçek kişi/işletme filtresi (demo, anonim, askıdaki hesaplar hariç). */
const REAL_ACCOUNT = { isDemo: false, anonymizedAt: null, suspendedAt: null } as const;

/** Vitrine girebilecek geri bildirim: silinmemiş ve demo işletmeye ait değil. */
const PUBLIC_FEEDBACK = { deletedAt: null, qrCode: { dealer: { isDemo: false } } } as const;

/** DB'den hesaplar. Hata fırlatır (çağıran önbellek katmanı yakalar; hata önbelleğe girmez). */
export async function computePublicStats(db: StatsDb, now: Date = new Date()): Promise<PublicStats> {
  const since = new Date(now.getTime() - THIRTY_DAYS_MS);
  const [members, businesses, agg, last30] = await Promise.all([
    db.user.count({ where: { role: 'CUSTOMER', ...REAL_ACCOUNT } }),
    db.user.count({ where: { role: 'DEALER', ...REAL_ACCOUNT } }),
    db.feedback.aggregate({ where: PUBLIC_FEEDBACK, _count: { _all: true }, _avg: { rating: true } }),
    db.feedback.count({ where: { ...PUBLIC_FEEDBACK, createdAt: { gte: since } } }),
  ]);

  const count = agg._count?._all ?? 0;
  const avg = agg._avg?.rating;
  const rating =
    count >= PUBLIC_STATS_THRESHOLDS.ratingSample && typeof avg === 'number' && Number.isFinite(avg)
      ? Math.round(avg * 10) / 10
      : null;

  return {
    members,
    businesses,
    feedbacks: count,
    feedbacksLast30d: last30,
    rating,
    ratingCount: count,
    computedAt: now.toISOString(),
  };
}

/** Önbellekten gelen değerin şeklini doğrular (eski/bozuk anahtar sızmasın). */
export function isPublicStats(value: unknown): value is PublicStats {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const n = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  return (
    n(v.members) &&
    n(v.businesses) &&
    n(v.feedbacks) &&
    n(v.feedbacksLast30d) &&
    n(v.ratingCount) &&
    (v.rating === null || n(v.rating)) &&
    typeof v.computedAt === 'string'
  );
}

export type PublicLocale = 'tr' | 'en';

function numberLocale(locale: PublicLocale): string {
  return locale === 'en' ? 'en-US' : 'tr-TR';
}

/**
 * Sayıyı AŞAĞI yuvarlayıp okunur yazar; yuvarlama yapıldıysa "+" ekler.
 * Hiçbir zaman gerçek değerden büyük bir sayı göstermez.
 *   847 → "847" · 1.284 → "1.200+" · 12.480 → "12.000+" · 1.250.000 → "1.200.000+"
 */
export function formatPublicCount(n: number, locale: PublicLocale = 'tr'): string {
  const value = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  let step = 1;
  if (value >= 1_000_000) step = 100_000;
  else if (value >= 10_000) step = 1_000;
  else if (value >= 1_000) step = 100;
  const floored = Math.floor(value / step) * step;
  const text = new Intl.NumberFormat(numberLocale(locale)).format(floored);
  return floored < value ? `${text}+` : text;
}

/** 4.6 → "4,6" (tr) / "4.6" (en). */
export function formatRating(r: number, locale: PublicLocale = 'tr'): string {
  return new Intl.NumberFormat(numberLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(r);
}

export interface VisibleStat {
  key: PublicStatKey;
  value: number;
  display: string;
}

/** Yalnız eşiği geçen metrikleri, istenen sırayla döndürür. */
export function selectVisibleStats(
  stats: PublicStats | null,
  keys: readonly PublicStatKey[],
  locale: PublicLocale = 'tr'
): VisibleStat[] {
  if (!stats) return [];
  const out: VisibleStat[] = [];
  for (const key of keys) {
    if (key === 'rating') {
      if (stats.rating !== null && stats.ratingCount >= PUBLIC_STATS_THRESHOLDS.ratingSample) {
        out.push({ key, value: stats.rating, display: formatRating(stats.rating, locale) });
      }
      continue;
    }
    const value = stats[key];
    if (value >= PUBLIC_STATS_THRESHOLDS[key]) {
      out.push({ key, value, display: formatPublicCount(value, locale) });
    }
  }
  return out;
}
