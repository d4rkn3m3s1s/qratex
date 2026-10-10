/**
 * awardBadge — rozet veren HER yolun tek giriş noktası (P0-14, yol haritası §5.3).
 *
 * Neden: rozet 7 ayrı yerde veriliyordu ve her biri koşul/aktiflik/gizlilik/ödül/görünürlük
 * kurallarını kendisi uyguluyordu. Biri (`POST /api/gamification/progress`) gövdeden gelen
 * `badgeId` ile koşulsuz rozet + `requirement.value` kadar puan basıyordu (10.000'e kadar).
 * O uç kaldırıldı; geri kalan yollar bu servise taşındı:
 *
 *   activity (lib/activity-badges) · character (lib/character-badges) · surprise
 *   (lib/surprise-badges) · purchase (badges/[id]/unlock) · admin (admin/users grant_badge) ·
 *   seasonal_event (customer/seasonal-event) · collection (lib/character-achievements)
 *
 * Tek transaction içinde sıra:
 *   1. Rozet satırı okunur: yok → BADGE_NOT_FOUND; `requireActive` ise `isActive=false` ya da
 *      `archivedAt` dolu → BADGE_INACTIVE; `allowHidden=false` ise sürpriz rozet → BADGE_HIDDEN.
 *   2. `userBadge.createMany({ skipDuplicates: true })` — unique (userId, badgeId) guard'ı;
 *      count=0 → ALREADY_OWNED, ödül YOK (tekrar çağrı puan çoğaltmaz). Postgres hatası
 *      üretmediği için çağıranın transaction'ını bozmaz.
 *   3. Ödül (`reward: 'catalog'`): `badgeRewardPoints(badgeId)` kadar puan `mintPoints` ile
 *      (`source: 'badge'`, `idempotencyKey: badge:<userId>:<badgeId>`). Defter, kilit, gölge ban
 *      ve `points_credited{category:'badge'}` orada; rozet geri alınıp yeniden verilse bile ödül
 *      ikinci kez basılmaz (P0-23'ün rozet ayağı).
 *   4. An Motoru: `recordBadgeMoment` aynı tx'te, yalnız rozet GERÇEKTEN yeni oluşturulduysa.
 *
 * Bildirim metinleri çağıranda kalır (her akışın kendi dili var); servis kazanımı ve ödülü
 * yönetir.
 */
import type { prisma as prismaClient } from '@/lib/prisma';
import { mintPoints, type EconomyDb, type EconomyTx } from '@/lib/economy';
import { badgeRewardPoints } from '@/lib/badge-reward-points';
import { recordBadgeMoment } from '@/lib/moments/server';

export type BadgeAwardSource =
  | 'activity'
  | 'character'
  | 'surprise'
  | 'purchase'
  | 'admin'
  | 'seasonal_event'
  | 'collection';

export interface AwardBadgeInput {
  userId: string;
  badgeId: string;
  /** Hangi akış veriyor (defter meta'sı ve denetim için). */
  source: BadgeAwardSource;
  /**
   * 'catalog' (varsayılan) → rozetin metin tablosundaki ödül puanı (lib/badge-reward-points).
   * 'none' → puan yok (satın alma, admin hediyesi, etkinlik rozeti: puanı başka yerde verilir).
   */
  reward?: 'catalog' | 'none';
  /** true (varsayılan) → pasif ya da arşivlenmiş rozet verilmez. */
  requireActive?: boolean;
  /** false → sürpriz (hiddenUntilEarned) rozet bu yoldan verilemez (satın alma). Varsayılan true. */
  allowHidden?: boolean;
  /** Tetikleyen admin/bayi (defterde `actorId`). */
  actorId?: string | null;
}

export interface AwardedBadge {
  id: string;
  name: string;
  icon: string;
  rarity: string;
  color: string | null;
  hiddenUntilEarned: boolean;
}

export type AwardBadgeRejectReason = 'BADGE_NOT_FOUND' | 'BADGE_INACTIVE' | 'BADGE_HIDDEN' | 'ALREADY_OWNED';

export type AwardBadgeResult =
  | { awarded: true; badge: AwardedBadge; points: number; userBadgeId: string | null }
  | { awarded: false; reason: AwardBadgeRejectReason; badge: AwardedBadge | null };

function isRootClient(db: EconomyDb): db is typeof prismaClient {
  return typeof (db as { $transaction?: unknown }).$transaction === 'function';
}

/**
 * Çağıranın transaction'ı içinde rozet verir. Reddedilen durumlar HATA FIRLATMAZ, sonuç
 * döner — çağıran kendi tx'ini geri almak istiyorsa (ör. satın almada borçlandırmayı) kendisi
 * fırlatır.
 */
export async function awardBadgeInTx(tx: EconomyTx, input: AwardBadgeInput): Promise<AwardBadgeResult> {
  const { userId, badgeId, source } = input;
  if (!userId || !badgeId) return { awarded: false, reason: 'BADGE_NOT_FOUND', badge: null };

  const row = await tx.badge.findUnique({
    where: { id: badgeId },
    select: {
      id: true,
      name: true,
      icon: true,
      rarity: true,
      color: true,
      hiddenUntilEarned: true,
      isActive: true,
      archivedAt: true,
    },
  });
  if (!row) return { awarded: false, reason: 'BADGE_NOT_FOUND', badge: null };

  const badge: AwardedBadge = {
    id: row.id,
    name: row.name,
    icon: row.icon,
    rarity: row.rarity,
    color: row.color ?? null,
    hiddenUntilEarned: row.hiddenUntilEarned === true,
  };

  if (input.requireActive !== false && (!row.isActive || row.archivedAt)) {
    return { awarded: false, reason: 'BADGE_INACTIVE', badge };
  }
  if (input.allowHidden === false && badge.hiddenUntilEarned) {
    return { awarded: false, reason: 'BADGE_HIDDEN', badge };
  }

  const created = await tx.userBadge.createMany({
    data: [{ userId, badgeId }],
    skipDuplicates: true,
  });
  if (created.count === 0) return { awarded: false, reason: 'ALREADY_OWNED', badge };

  const owned = await tx.userBadge.findUnique({
    where: { userId_badgeId: { userId, badgeId } },
    select: { id: true },
  });

  let points = 0;
  const rewardPoints = input.reward === 'none' ? 0 : badgeRewardPoints(badgeId);
  if (rewardPoints > 0) {
    const minted = await mintPoints(tx, {
      userId,
      points: rewardPoints,
      xp: 0,
      source: 'badge',
      sourceId: badgeId,
      idempotencyKey: `badge:${userId}:${badgeId}`,
      actorId: input.actorId ?? null,
      meta: { badgeId, via: source },
    });
    points = minted.duplicate ? 0 : minted.credited;
  }

  await recordBadgeMoment(tx, userId, badge);

  return { awarded: true, badge, points, userBadgeId: owned?.id ?? null };
}

/**
 * Rozet verir. Kök Prisma istemcisi verilirse kendi transaction'ını açar; bir `tx` verilirse
 * çağıranın transaction'ına katılır.
 */
export async function awardBadge(db: EconomyDb, input: AwardBadgeInput): Promise<AwardBadgeResult> {
  if (isRootClient(db)) {
    return db.$transaction((tx) => awardBadgeInTx(tx, input));
  }
  return awardBadgeInTx(db, input);
}

/** Kullanıcıya gösterilecek ret metinleri (Türkçe). */
export const AWARD_BADGE_REJECT_MESSAGES: Record<AwardBadgeRejectReason, string> = {
  BADGE_NOT_FOUND: 'Rozet bulunamadı.',
  BADGE_INACTIVE: 'Bu rozet şu anda kazanılamıyor.',
  BADGE_HIDDEN: 'Bu rozet yalnızca kazanılarak açılır.',
  ALREADY_OWNED: 'Bu rozete zaten sahipsiniz.',
};
