/**
 * Tara sayfasının sunucu özeti (ilk render'da, istemci isteği olmadan).
 *
 *  - Taban geri bildirim ödülü: puan matrisi (admin ayarı, lib/points-rules) — istemcide
 *    sabit yazılmaz (yalnız gösterim; kredi /api/feedbacks'te, tavan lib/economy'de).
 *  - Bugün kalan geri bildirim puanı: lib/economy/caps `feedback` kuralı ve aynı sayım
 *    (`sumEarnedInWindow`) — tavanı uygulayan kodla birebir aynı pencere.
 *  - Son mekânlar: müşterinin son geri bildirimlerinden tekilleştirilmiş işletmeler.
 *  - Aktif fiziksel kart var mı (kart bağlama ipucu için).
 *
 * Yalnız oturumdaki kullanıcının kendi verisi okunur (userId = oturum).
 */
import { prisma } from '@/lib/prisma';
import { getPointsMatrix } from '@/lib/points-rules';
import { ECONOMY_CAPS, sumEarnedInWindow } from '@/lib/economy/caps';
import type { RecentVenue, ScanSummary } from '@/components/customer/m-tara/scan-types';

export const RECENT_VENUE_LIMIT = 4;
/** Son mekânları bulmak için bakılan geri bildirim sayısı (tekilleştirme öncesi). */
const RECENT_FEEDBACK_WINDOW = 40;

type FeedbackRow = {
  createdAt: Date;
  qrCode: {
    name: string;
    dealerId: string;
    location: { name: string } | null;
    dealer: { name: string | null; businessName: string | null; businessLogo: string | null } | null;
  } | null;
};

/** Geri bildirim satırlarından (yeniden eskiye) işletme başına en yeni ziyaret. */
export function pickRecentVenues(rows: readonly FeedbackRow[], limit = RECENT_VENUE_LIMIT): RecentVenue[] {
  const seen = new Set<string>();
  const out: RecentVenue[] = [];
  for (const row of rows) {
    const qr = row.qrCode;
    if (!qr || seen.has(qr.dealerId)) continue;
    seen.add(qr.dealerId);
    const name = qr.dealer?.businessName?.trim() || qr.dealer?.name?.trim();
    if (!name) continue;
    out.push({
      dealerId: qr.dealerId,
      name,
      logoUrl: qr.dealer?.businessLogo || null,
      placeLabel: qr.location?.name ?? null,
      lastVisitAt: row.createdAt.toISOString(),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function remainingFeedbackPoints(earned: { today: number; week: number }): number {
  const rule = ECONOMY_CAPS.feedback;
  const daily = rule.daily === undefined ? Number.POSITIVE_INFINITY : rule.daily - earned.today;
  const weekly = rule.weekly === undefined ? Number.POSITIVE_INFINITY : rule.weekly - earned.week;
  const remaining = Math.min(daily, weekly);
  return Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : 0;
}

export async function loadScanSummary(userId: string): Promise<ScanSummary> {
  const [matrix, earned, user, feedbacks, activeCard] = await Promise.all([
    getPointsMatrix(),
    sumEarnedInWindow(prisma, { userId, rule: ECONOMY_CAPS.feedback }),
    prisma.user.findUnique({ where: { id: userId }, select: { points: true } }),
    prisma.feedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_FEEDBACK_WINDOW,
      select: {
        createdAt: true,
        qrCode: {
          select: {
            name: true,
            dealerId: true,
            location: { select: { name: true } },
            dealer: { select: { name: true, businessName: true, businessLogo: true } },
          },
        },
      },
    }),
    prisma.physicalCard.findFirst({
      where: { customerId: userId, status: 'ACTIVATED', archivedAt: null },
      select: { id: true },
    }),
  ]);

  return {
    reward: {
      basePoints: matrix.feedback.base.points,
      detailedPoints: matrix.feedback.detailed.points,
      detailThreshold: matrix.feedback.longTextThreshold,
      remainingToday: remainingFeedbackPoints(earned),
    },
    balance: user?.points ?? 0,
    recentVenues: pickRecentVenues(feedbacks as FeedbackRow[]),
    hasActiveCard: !!activeCard,
  };
}
