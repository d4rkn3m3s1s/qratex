import { prisma } from '@/lib/prisma';

/**
 * "Ayın İşletmesi" — her ayın 1. sıradaki işletmesine bir ROZET/ünvan verir.
 *
 * Karar (kullanıcı): PUAN değil ROZET. Bu yüzden puan ekonomisine HİÇ dokunmaz —
 * escrow/mint/velocity gerekmez. Yalnızca fail-closed cron + idempotent tek-seferlik
 * kayıt yeterli. Kazanan, önceki ayın QR geri bildirimlerine göre (avg rating + adet)
 * category-leaderboard mantığıyla belirlenir.
 *
 * Depolama: yeni tablo/migration yerine `Settings` (key='business_of_month').
 * İdempotency: periodKey ("YYYY-MM") — aynı ay ikinci kez yazılmaz.
 */

export const BUSINESS_OF_MONTH_SETTINGS_KEY = 'business_of_month';
const MIN_FEEDBACKS = 3;

export type BusinessOfMonthWinner = {
  dealerId: string;
  name: string;
  businessCategory: string | null;
  avgRating: number;
  feedbackCount: number;
};

export type BusinessOfMonthRecord = {
  periodKey: string; // "YYYY-MM" (ödüllendirilen ay)
  awardedAt: string; // ISO
  winner: BusinessOfMonthWinner | null;
};

/** Verilen tarihe göre bir önceki ayın periodKey'ini üretir ("YYYY-MM"). */
export function previousMonthKey(now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11
  const prev = new Date(Date.UTC(y, m - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthRangeFromKey(periodKey: string): { start: Date; end: Date } {
  const [y, m] = periodKey.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1)); // sonraki ayın başı (exclusive)
  return { start, end };
}

/** Verilen ay için kazananı hesaplar (avg rating DESC, feedback count DESC). */
export async function computeBusinessOfMonth(periodKey: string): Promise<BusinessOfMonthWinner | null> {
  const { start, end } = monthRangeFromKey(periodKey);

  // O ayın QR geri bildirimlerini dealer bazında topla.
  const feedbacks = await prisma.feedback.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: start, lt: end },
      qrCode: { dealer: { role: 'DEALER' } },
    },
    select: { rating: true, qrCode: { select: { dealerId: true } } },
    take: 20000,
  });

  const byDealer = new Map<string, { sum: number; count: number }>();
  for (const f of feedbacks) {
    const did = f.qrCode?.dealerId;
    if (!did || typeof f.rating !== 'number') continue;
    const cur = byDealer.get(did) ?? { sum: 0, count: 0 };
    cur.sum += f.rating;
    cur.count += 1;
    byDealer.set(did, cur);
  }

  const ranked = [...byDealer.entries()]
    .filter(([, v]) => v.count >= MIN_FEEDBACKS)
    .map(([dealerId, v]) => ({ dealerId, avgRating: v.sum / v.count, feedbackCount: v.count }))
    .sort((a, b) => b.avgRating - a.avgRating || b.feedbackCount - a.feedbackCount);

  const top = ranked[0];
  if (!top) return null;

  const dealer = await prisma.user.findUnique({
    where: { id: top.dealerId },
    select: { businessName: true, name: true, businessCategory: true },
  });

  return {
    dealerId: top.dealerId,
    name: dealer?.businessName || dealer?.name || 'İşletme',
    businessCategory: dealer?.businessCategory ?? null,
    avgRating: Math.round(top.avgRating * 10) / 10,
    feedbackCount: top.feedbackCount,
  };
}

/** Mevcut "Ayın İşletmesi" kaydını okur (yoksa null). */
export async function getBusinessOfMonth(): Promise<BusinessOfMonthRecord | null> {
  const row = await prisma.settings.findUnique({
    where: { key: BUSINESS_OF_MONTH_SETTINGS_KEY },
    select: { value: true },
  });
  const v = row?.value as BusinessOfMonthRecord | null | undefined;
  if (!v || typeof v !== 'object' || !('periodKey' in v)) return null;
  return v;
}

/**
 * Ayın işletmesini belirler ve kaydeder. İDEMPOTENT: aynı periodKey zaten kayıtlıysa
 * hiçbir şey yapmaz (tek-seferlik). Rozet olduğu için puan kredisi/AnalyticsEvent yok.
 */
export async function awardBusinessOfMonth(now: Date): Promise<{ skipped: boolean; record: BusinessOfMonthRecord }> {
  const periodKey = previousMonthKey(now);

  const existing = await getBusinessOfMonth();
  if (existing?.periodKey === periodKey) {
    return { skipped: true, record: existing };
  }

  const winner = await computeBusinessOfMonth(periodKey);
  const record: BusinessOfMonthRecord = {
    periodKey,
    awardedAt: now.toISOString(),
    winner,
  };

  await prisma.settings.upsert({
    where: { key: BUSINESS_OF_MONTH_SETTINGS_KEY },
    create: { key: BUSINESS_OF_MONTH_SETTINGS_KEY, category: 'growth', value: record as object },
    update: { value: record as object },
  });

  return { skipped: false, record };
}
