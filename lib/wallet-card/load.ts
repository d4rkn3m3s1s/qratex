/**
 * Cüzdan → Kartım sunucu yükleyicisi (sunucu bileşeni ilk render'ı ve BFF ucu ortak kullanır).
 * Bütün sorgular paralel; yanıt açık DTO (`./dto`). Yalnız sunucuda çağrılır.
 */
import { prisma } from '@/lib/prisma';
import { getBirthdayBonusPoints, getPointsMatrix } from '@/lib/points-rules';
import { getLeagueRules } from '@/lib/league-rules';
import { isAppleWalletConfigured, isGoogleWalletConfigured } from '@/lib/wallet';
import {
  SYNTHETIC_CARD_BLOCK_REASON,
  buildBirthday,
  buildLeagueStatus,
  buildVip,
  mapCards,
  sumPointsBySource,
  type WalletCardPayload,
} from './dto';

export const WALLET_RECENT_LIMIT = 5;
export const WALLET_PENDING_LIMIT = 3;

export class WalletUserNotFoundError extends Error {
  constructor() {
    super('Kullanıcı bulunamadı');
    this.name = 'WalletUserNotFoundError';
  }
}

export async function loadWalletCard(userId: string, now: Date = new Date()): Promise<WalletCardPayload> {
  const [user, cardRows, pendingCount, pendingRows, recentRows, matrix, rules] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        points: true,
        level: true,
        vipStatus: {
          select: {
            tierExpiry: true,
            tier: { select: { name: true, color: true, icon: true, multiplier: true, isActive: true } },
          },
        },
        birthday: { select: { birthDate: true, createdAt: true, lastBonusAt: true } },
      },
    }),
    prisma.physicalCard.findMany({
      where: {
        customerId: userId,
        archivedAt: null,
        // NULL blockReason `not` ile elenmesin diye açık OR (Prisma NULL semantiği).
        OR: [{ blockReason: null }, { blockReason: { not: SYNTHETIC_CARD_BLOCK_REASON } }],
      },
      orderBy: [{ activatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 10,
      select: {
        id: true,
        token: true,
        status: true,
        activatedAt: true,
        blockReason: true,
        archivedAt: true,
        _count: { select: { consumptions: true } },
        consumptions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.consumption.count({ where: { customerId: userId, review: null } }),
    prisma.consumption.findMany({
      where: { customerId: userId, review: null },
      orderBy: { createdAt: 'desc' },
      take: WALLET_PENDING_LIMIT,
      select: { id: true, createdAt: true, dealer: { select: { businessName: true } } },
    }),
    prisma.consumption.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: 'desc' },
      take: WALLET_RECENT_LIMIT,
      select: {
        id: true,
        createdAt: true,
        dealer: { select: { businessName: true } },
        product: { select: { name: true } },
        review: { select: { id: true } },
      },
    }),
    getPointsMatrix(),
    getLeagueRules(),
  ]);

  if (!user) throw new WalletUserNotFoundError();

  // Tüketim başına kazanılan pasif puan (defter). Defter tablosu henüz yoksa ya da sorgu
  // düşerse puan sütunu gösterilmez — kart ekranını düşürmez (kritik iş QR).
  let earned = new Map<string, number>();
  if (recentRows.length > 0) {
    try {
      const ledger = await prisma.pointsLedger.findMany({
        where: {
          userId,
          source: 'dealer_passive',
          status: 'posted',
          sourceId: { in: recentRows.map((r) => r.id) },
        },
        select: { sourceId: true, delta: true },
      });
      earned = sumPointsBySource(ledger);
    } catch (error) {
      console.warn('[wallet-card] defter okunamadı; puan sütunu gizlendi', error);
    }
  }

  return {
    holderName: user.name?.trim() || null,
    cards: mapCards(cardRows),
    status: {
      points: user.points,
      level: user.level,
      ...buildLeagueStatus(user.points, rules),
      vip: buildVip(user.vipStatus, now),
    },
    birthday: buildBirthday(user.birthday, getBirthdayBonusPoints(matrix), now),
    recent: recentRows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      dealerName: r.dealer?.businessName ?? null,
      productName: r.product?.name ?? null,
      pointsEarned: earned.has(r.id) ? (earned.get(r.id) as number) : null,
      reviewed: !!r.review,
    })),
    pending: {
      count: pendingCount,
      items: pendingRows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        dealerName: r.dealer?.businessName ?? null,
      })),
    },
    wallet: { apple: isAppleWalletConfigured(), google: isGoogleWalletConfigured() },
    generatedAt: now.toISOString(),
  };
}
