/**
 * /c/[token] sunucu görünüm modeli — kartın durumu OTURUMA GÖRE türetilir (rapor B4, B12).
 *
 *  - Sahibin adı ve kart geçmişi YALNIZ sahibine; başkasına yalnız "bir üyeye ait".
 *  - Blok gerekçesi (iç not) hiç dışarı çıkmaz; sahibine "dondurdun" / "yönetim engeli" ayrımı.
 *  - Yetim kart (bağsız ya da sahibi anonimleştirilmiş) "sahiplenilebilir" görünür (B2).
 *  - Kazanç bilgisi sunucudaki puan matrisinden (sabit kodlu değil).
 */
import { prisma } from '@/lib/prisma';
import { getPointsMatrix } from '@/lib/points-rules';
import { CARD_TOKEN_PATTERN } from '@/lib/qr-resolve';
import { deriveCardViewState, type CardViewState } from '@/lib/cards/claim';
import { CUSTOMER_FREEZE_REASON } from '@/lib/wallet-card/dto';
import { maskCardToken } from '@/lib/wallet-card/snapshot';

export type ViewerKind = 'anon' | 'customer' | 'staff' | 'admin' | 'dealer';

export interface CardPageViewer {
  kind: ViewerKind;
  id: string | null;
  name: string | null;
}

export interface CardOwnerDetails {
  cardId: string;
  holderName: string | null;
  activatedAt: string | null;
  usesCount: number;
  lastUsedAt: string | null;
}

export interface CardReward {
  base: number;
  detailed: number;
  threshold: number;
}

export interface CardPageModel {
  state: CardViewState;
  token: string;
  maskedToken: string;
  /** Sahiplenilebilir kart önceden bir sahibe bağlıydı (yetim) — metin farkı için. */
  orphan: boolean;
  owner: CardOwnerDetails | null;
  /** Müşteri izleyicinin başka aktif kartı var mı (bilgi notu). */
  hasOtherCard: boolean;
  reward: CardReward | null;
}

export function viewerKindOf(role: string | null | undefined): ViewerKind {
  switch (role) {
    case 'CUSTOMER':
      return 'customer';
    case 'STAFF':
      return 'staff';
    case 'ADMIN':
      return 'admin';
    case 'DEALER':
      return 'dealer';
    default:
      return 'anon';
  }
}

async function loadReward(): Promise<CardReward | null> {
  try {
    const matrix = await getPointsMatrix();
    return {
      base: matrix.consumptionReview.base.points,
      detailed: matrix.consumptionReview.detailed.points,
      threshold: matrix.consumptionReview.longTextThreshold,
    };
  } catch {
    return null;
  }
}

export async function loadCardPage(token: string, viewer: CardPageViewer): Promise<CardPageModel> {
  const masked = maskCardToken(token);
  const empty: CardPageModel = {
    state: 'not_found',
    token,
    maskedToken: masked,
    orphan: false,
    owner: null,
    hasOtherCard: false,
    reward: null,
  };
  if (!CARD_TOKEN_PATTERN.test(token)) return empty;

  const card = await prisma.physicalCard.findUnique({
    where: { token },
    select: {
      id: true,
      status: true,
      customerId: true,
      archivedAt: true,
      activatedAt: true,
      blockReason: true,
      customer: { select: { anonymizedAt: true, name: true } },
    },
  });

  const state = deriveCardViewState(card, viewer.id, CUSTOMER_FREEZE_REASON);
  if (!card || state === 'not_found') return empty;

  const model: CardPageModel = { ...empty, state, orphan: state === 'claimable' && (card.status === 'ACTIVATED' || !!card.customerId) };

  if (state === 'mine' || state === 'frozen_mine' || state === 'blocked_mine') {
    const [usesCount, last, reward] = await Promise.all([
      prisma.consumption.count({ where: { cardId: card.id, customerId: viewer.id ?? undefined } }),
      prisma.consumption.findFirst({
        where: { cardId: card.id, customerId: viewer.id ?? undefined },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      state === 'mine' ? loadReward() : Promise.resolve(null),
    ]);
    model.owner = {
      cardId: card.id,
      holderName: card.customer?.name ?? null,
      activatedAt: card.activatedAt ? card.activatedAt.toISOString() : null,
      usesCount,
      lastUsedAt: last ? last.createdAt.toISOString() : null,
    };
    model.reward = reward;
    return model;
  }

  if (state === 'claimable') {
    const [reward, other] = await Promise.all([
      loadReward(),
      viewer.kind === 'customer' && viewer.id
        ? prisma.physicalCard.findFirst({
            where: { customerId: viewer.id, status: 'ACTIVATED', archivedAt: null, NOT: { id: card.id } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    model.reward = reward;
    model.hasOtherCard = !!other;
  }

  return model;
}
