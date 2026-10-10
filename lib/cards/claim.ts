/**
 * Fiziksel kartın SAHİPLENİLMESİ (müşterinin kendi aktivasyonu) + kart sayfası görünüm durumu.
 *
 * Kart yaşam döngüsü (lib/cards/lifecycle.ts) "UNUSED → ACTIVATED yalnız atama ya da müşterinin
 * kendi aktivasyonu" der. Bu modül müşteri aktivasyonunun TEK uygulamasıdır:
 *  - Koşullu yazma (`updateMany where status+customerId`): iki eşzamanlı aktivasyonda yalnız biri
 *    kazanır (rapor B3 — TOCTOU).
 *  - YETİM KART (rapor B2): eskiden hesap silme `user.delete` ile kartı `ACTIVATED + customerId=null`
 *    bırakıyordu; bugün hesap silme anonimleştirir ve kart anonim kullanıcıya bağlı kalır. Her iki
 *    durumda kart kimsenin değildir → yeniden sahiplenilebilir. Serbest bırakma aynı işlemde
 *    `RELEASED_ORPHAN` denetim kaydıyla yazılır.
 *  - Bloklu (admin bloğu ya da sahibin dondurması) ve arşivli kart asla sahiplenilemez.
 *
 * Puan YOK: aktivasyon puan basmaz (hoş geldin bonusu için yönetilebilir bir ekonomi ayarı yok;
 * sabit kodlu ödül yazılmaz). Kart kazancı tüketim yorumlarından gelir (lib/points-rules).
 */
import type { Prisma } from '@prisma/client';

/** Sayfadaki görünüm durumu (sunucu türetir; istemci kural tekrar etmez). */
export type CardViewState =
  | 'not_found'
  /** Kullanılmamış ya da yetim kart: sahiplenilebilir. */
  | 'claimable'
  | 'mine'
  /** Sahibi kendisi dondurmuş (Kartım'dan çözebilir). */
  | 'frozen_mine'
  /** Yönetim engeli — sahibine destek yolu. */
  | 'blocked_mine'
  /** Başkasının bloklu kartı — nötr mesaj. */
  | 'blocked'
  /** Başka bir üyenin aktif kartı. */
  | 'taken';

export interface ClaimableCardRow {
  status: string;
  customerId: string | null;
  archivedAt: Date | null;
  blockReason?: string | null;
  customer?: { anonymizedAt: Date | null } | null;
}

/** Kart kimsenin değil mi? (bağsız ya da sahibi anonimleştirilmiş/silinmiş) */
export function isOwnerless(card: Pick<ClaimableCardRow, 'customerId' | 'customer'>): boolean {
  if (!card.customerId) return true;
  return !!card.customer?.anonymizedAt;
}

/** Sahiplenilebilir mi? (UNUSED ya da ACTIVATED + sahipsiz; blok/arşiv asla) */
export function isClaimable(card: ClaimableCardRow): boolean {
  if (card.archivedAt) return false;
  if (card.status !== 'UNUSED' && card.status !== 'ACTIVATED') return false;
  return isOwnerless(card);
}

export function deriveCardViewState(
  card: ClaimableCardRow | null,
  viewerId: string | null,
  customerFreezeReason: string
): CardViewState {
  if (!card || card.archivedAt) return 'not_found';
  const isOwner = !!viewerId && !!card.customerId && card.customerId === viewerId;
  if (card.status === 'BLOCKED') {
    if (!isOwner) return 'blocked';
    return card.blockReason === customerFreezeReason ? 'frozen_mine' : 'blocked_mine';
  }
  if (isOwner) return 'mine';
  if (isClaimable(card)) return 'claimable';
  return 'taken';
}

export type ClaimErrorCode = 'CARD_NOT_FOUND' | 'CARD_BLOCKED' | 'ALREADY_YOURS' | 'ALREADY_ACTIVATED';

export class CardClaimError extends Error {
  readonly code: ClaimErrorCode;
  constructor(code: ClaimErrorCode) {
    super(code);
    this.name = 'CardClaimError';
    this.code = code;
  }
}

export interface ClaimResult {
  id: string;
  status: string;
  activatedAt: Date | null;
  /** Yetim kart serbest bırakılıp bağlandı. */
  released: boolean;
}

export interface ClaimInput {
  token: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  now?: Date;
}

const CARD_SELECT = {
  id: true,
  status: true,
  customerId: true,
  archivedAt: true,
  blockReason: true,
  customer: { select: { anonymizedAt: true } },
} as const;

/**
 * Kartı oturumdaki müşteriye bağlar. `tx` bir Prisma transaction istemcisidir (çağıran açar).
 * Hata durumunda `CardClaimError` fırlatır (transaction geri alınır).
 */
export async function claimCard(tx: Prisma.TransactionClient, input: ClaimInput): Promise<ClaimResult> {
  const now = input.now ?? new Date();
  const card = (await tx.physicalCard.findUnique({ where: { token: input.token }, select: CARD_SELECT })) as
    | (ClaimableCardRow & { id: string })
    | null;

  if (!card || card.archivedAt) throw new CardClaimError('CARD_NOT_FOUND');
  if (card.status === 'BLOCKED') throw new CardClaimError('CARD_BLOCKED');
  if (card.customerId && card.customerId === input.userId) throw new CardClaimError('ALREADY_YOURS');
  if (!isClaimable(card)) throw new CardClaimError('ALREADY_ACTIVATED');

  // Önceki durum yazmadan ÖNCE yakalanır (denetim kaydı bunu taşır).
  const prevOwner = card.customerId;
  const prevStatus = card.status;
  const released = prevStatus === 'ACTIVATED' || !!prevOwner;

  const claimed = await tx.physicalCard.updateMany({
    where: { id: card.id, status: prevStatus as 'UNUSED' | 'ACTIVATED', customerId: prevOwner, archivedAt: null },
    data: { status: 'ACTIVATED', customerId: input.userId, activatedAt: now, blockedAt: null, blockReason: null },
  });
  if (claimed.count !== 1) {
    // Yarış: arada başkası (ya da aynı kişi ikinci sekmeden) bağladı.
    const fresh = await tx.physicalCard.findUnique({ where: { id: card.id }, select: { customerId: true } });
    throw new CardClaimError(fresh?.customerId === input.userId ? 'ALREADY_YOURS' : 'ALREADY_ACTIVATED');
  }

  const meta = { ipAddress: input.ipAddress, userAgent: input.userAgent };
  if (released) {
    await tx.cardAuditLog.create({
      data: {
        cardId: card.id,
        userId: input.userId,
        action: 'RELEASED_ORPHAN',
        metadata: { previousOwner: prevOwner ? 'anonymized' : 'none', previousStatus: prevStatus },
        ...meta,
      },
    });
  }
  await tx.cardAuditLog.create({
    data: {
      cardId: card.id,
      userId: input.userId,
      action: 'ACTIVATED',
      // KVKK: denetim kaydında e-posta değil kullanıcı id'si (userId alanı) yeterli.
      metadata: { via: 'self_activation', released },
      ...meta,
    },
  });

  return { id: card.id, status: 'ACTIVATED', activatedAt: now, released };
}
