/**
 * ConsumptionService — bayi tüketim kaydının TEK yazma yolu (canlı uç + offline-sync).
 *
 * Kapatılan bulgular:
 *  - P0-13: pasif puan ham `user.update({ points: { increment } })` ile, transaction dışında,
 *    `points_credited` yazmadan basılıyordu. Artık `mintPoints(source: 'dealer_passive',
 *    actorId: dealerId)` ile tüketim kaydı, kart denetim kaydı, bildirim ve klan puanıyla
 *    AYNI transaction'da; müşteri × bayi × gün (300) ve müşteri × gün (600) tavanı, gölge ban
 *    kapısı, defter satırı ve `points_credited` görünürlüğü mintPoints'ten gelir.
 *  - P0-13: mutlu saat çarpanı okuma anında [1, 3] aralığına kırpılır (canlıdaki eski kayıtlar).
 *  - P0-21: çarpan şelalesi (mutlu saat × sezon) toplamda ≤ 4; sezon bonusu ≤ 250; tek
 *    tüketimden basılabilecek pasif puan ≤ 300; BIRTHDAY/ANNIVERSARY yalnız ilgili müşteriye.
 *  - P0-18: offline-sync artık bu servisi çağırır → oran sınırı, ürün sahipliği, kart durumu,
 *    tutar sınırı, denetim kaydı ve `clientOpId` idempotency'si iki kanalda da aynı.
 *  - Kart–bayi ilişkisi: bayi kendi müşteri kartına tüketim yazamaz (kendine puan basma);
 *    arşivlenmiş/bloklu/aktive edilmemiş kart reddedilir.
 *
 * Yan etkiler (ısı haritası, ziyaret görevleri) transaction dışında `runConsumptionSideEffects`
 * ile, route'ta `after()` içinde çalıştırılır; tekrar oynatılan (duplicate) kayıtta çalışmaz.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { mintPoints, type MintResult } from '@/lib/economy';
import { isUniqueViolation } from '@/lib/economy/errors';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { getLiveHappyHourMultiplier } from '@/lib/happy-hour-live';
import { getActiveSeasonalCampaign } from '@/lib/seasonal-campaign-live';
import { combineMultipliers } from '@/lib/points-multipliers';

// ───────────────────────────── Politika sabitleri ─────────────────────────────

/** Tek tüketim tutarı üst sınırı (TL). `parseFloat` ile sınırsız tutar yazılabiliyordu. */
export const MAX_CONSUMPTION_AMOUNT = 1_000_000;
/** Tutardan türeyen ham taban (tutar × 10) bu değerle sınırlıdır. */
export const CONSUMPTION_BASE_XP_CAP = 1000;
/** Tutar girilmezse kullanılan ham taban. */
export const CONSUMPTION_DEFAULT_BASE_XP = 50;
/** Pasif puan = taban × %5 × çarpan. */
export const CONSUMPTION_PASSIVE_RATE = 0.05;
/** Tek tüketimden basılabilecek pasif puanın mutlak üst sınırı (bayi × müşteri günlük tavanı). */
export const PASSIVE_POINTS_MAX_PER_CONSUMPTION = 300;
/** Aynı kart + bayi için dakikada en fazla bu kadar tüketim (çapraz-instance atomik sayaç). */
export const CONSUMPTION_RATE_LIMIT_MAX = 5;
export const CONSUMPTION_RATE_LIMIT_WINDOW_MS = 60_000;

export const CLIENT_OP_ID_RE = /^[A-Za-z0-9_.:-]{8,100}$/;

// ───────────────────────────── Girdi şeması ─────────────────────────────

export const consumptionInputSchema = z.object({
  cardToken: z
    .string({ required_error: 'Kart token gerekli', invalid_type_error: 'Kart token metin olmalı' })
    .trim()
    .min(1, 'Kart token gerekli')
    .max(200, 'Kart token çok uzun'),
  productId: z
    .string({ invalid_type_error: 'Ürün kimliği metin olmalı' })
    .trim()
    .max(64, 'Ürün kimliği çok uzun')
    .nullish()
    .transform((v) => (v ? v : null)),
  amount: z
    .number({ invalid_type_error: 'Tutar sayı olmalı' })
    .finite('Tutar sayı olmalı')
    .nonnegative('Tutar negatif olamaz')
    .max(MAX_CONSUMPTION_AMOUNT, `Tutar en fazla ${MAX_CONSUMPTION_AMOUNT.toLocaleString('tr-TR')} olabilir`)
    .nullish()
    .transform((v) => (v === undefined ? null : v)),
  note: z
    .string({ invalid_type_error: 'Not metin olmalı' })
    .max(500, 'Not en fazla 500 karakter olabilir')
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  clientOpId: z
    .string({ invalid_type_error: 'İşlem kimliği metin olmalı' })
    .regex(CLIENT_OP_ID_RE, 'İşlem kimliği 8–100 karakter; harf, rakam ve _ . : - içerebilir')
    .nullish()
    .transform((v) => v ?? null),
});

export type ConsumptionInput = z.input<typeof consumptionInputSchema>;
export type ParsedConsumptionInput = z.output<typeof consumptionInputSchema>;

// ───────────────────────────── Hata tipi ─────────────────────────────

export type ConsumptionErrorCode =
  | 'VALIDATION'
  | 'CARD_NOT_FOUND'
  | 'CARD_BLOCKED'
  | 'CARD_ARCHIVED'
  | 'CARD_NOT_ACTIVATED'
  | 'SELF_DEALING'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_FORBIDDEN'
  | 'RATE_LIMITED'
  | 'CLIENT_OP_CONFLICT';

const STATUS: Record<ConsumptionErrorCode, number> = {
  VALIDATION: 400,
  CARD_NOT_FOUND: 404,
  CARD_BLOCKED: 403,
  CARD_ARCHIVED: 403,
  CARD_NOT_ACTIVATED: 400,
  SELF_DEALING: 403,
  PRODUCT_NOT_FOUND: 404,
  PRODUCT_FORBIDDEN: 403,
  RATE_LIMITED: 429,
  CLIENT_OP_CONFLICT: 409,
};

export class ConsumptionError extends Error {
  readonly code: ConsumptionErrorCode;
  readonly retryAfterSec?: number;
  readonly details?: unknown;
  constructor(code: ConsumptionErrorCode, message: string, opts: { retryAfterSec?: number; details?: unknown } = {}) {
    super(message);
    this.name = 'ConsumptionError';
    this.code = code;
    this.retryAfterSec = opts.retryAfterSec;
    this.details = opts.details;
  }
  get httpStatus(): number {
    return STATUS[this.code];
  }
  /** Daha sonra tekrar denenebilir mi (offline kuyruğu için: deneme hakkı yakmaz). */
  get retryable(): boolean {
    return this.code === 'RATE_LIMITED';
  }
}

export function isConsumptionError(e: unknown): e is ConsumptionError {
  return e instanceof ConsumptionError;
}

// ───────────────────────────── Saf puan hesabı ─────────────────────────────

export interface PassivePointsBreakdown {
  baseXp: number;
  happyHourMultiplier: number;
  seasonalMultiplier: number;
  seasonalBonus: number;
  /** Şelale tavanı uygulanmış toplam çarpan (≤ 4). */
  combinedMultiplier: number;
  /** Tavanlar (kategori/günlük) ÖNCESİ, tüketim başı sınır SONRASI istenen pasif puan. */
  points: number;
}

/**
 * Tüketimden doğan pasif puanı hesaplar (saf). Sıra: taban (tutar × 10, ≤ 1000) →
 * × %5 × min(mutlu saat × sezon, 4) → + sezon bonusu → ≤ 300.
 */
export function computePassivePoints(params: {
  amount: number | null;
  happyHourMultiplier?: number;
  seasonalMultiplier?: number;
  seasonalBonus?: number;
}): PassivePointsBreakdown {
  const raw =
    params.amount !== null && Number.isFinite(params.amount) && params.amount > 0
      ? Math.floor(params.amount * 10)
      : CONSUMPTION_DEFAULT_BASE_XP;
  const baseXp = Math.min(Math.max(0, raw), CONSUMPTION_BASE_XP_CAP);
  const hh = params.happyHourMultiplier ?? 1;
  const seasonal = params.seasonalMultiplier ?? 1;
  const bonus = Math.max(0, Math.floor(params.seasonalBonus ?? 0));
  const combined = combineMultipliers(hh, seasonal);
  const points = Math.min(
    PASSIVE_POINTS_MAX_PER_CONSUMPTION,
    Math.floor(baseXp * CONSUMPTION_PASSIVE_RATE * combined) + bonus
  );
  return {
    baseXp,
    happyHourMultiplier: hh,
    seasonalMultiplier: seasonal,
    seasonalBonus: bonus,
    combinedMultiplier: combined,
    points: Math.max(0, points),
  };
}

// ───────────────────────────── Servis ─────────────────────────────

export type ConsumptionChannel = 'live' | 'offline';

export interface CreateConsumptionContext {
  /** Tüketimi yazan işletme (bayi) kullanıcı kimliği. */
  dealerId: string;
  channel: ConsumptionChannel;
  ipAddress?: string | null;
  userAgent?: string | null;
  now?: Date;
  /** Varsayılan true. */
  rateLimit?: boolean;
}

const CONSUMPTION_RESPONSE_SELECT = {
  id: true,
  cardId: true,
  productId: true,
  amount: true,
  note: true,
  clientOpId: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { name: true, email: true } },
  product: { select: { id: true, name: true, price: true } },
} satisfies Prisma.ConsumptionSelect;

export type ConsumptionDto = Prisma.ConsumptionGetPayload<{ select: typeof CONSUMPTION_RESPONSE_SELECT }>;

export interface CreateConsumptionResult {
  consumption: ConsumptionDto;
  /** Aynı clientOpId daha önce işlenmiş; yeni kayıt ve yeni puan YOK. */
  duplicate: boolean;
  customerId: string;
  passive: {
    requested: number;
    credited: number;
    capped: boolean;
    combinedMultiplier: number;
    happyHourId: string | null;
    seasonalCampaignId: string | null;
  };
}

async function findExistingByClientOp(dealerId: string, clientOpId: string) {
  return prisma.consumption.findFirst({
    where: { dealerId, clientOpId },
    select: { ...CONSUMPTION_RESPONSE_SELECT, customerId: true },
  });
}

function duplicateResult(
  existing: ConsumptionDto & { customerId: string },
  cardId: string
): CreateConsumptionResult {
  if (existing.cardId !== cardId) {
    throw new ConsumptionError('CLIENT_OP_CONFLICT', 'Bu işlem kimliği farklı bir kart için zaten kullanılmış.');
  }
  const { customerId, ...consumption } = existing;
  return {
    consumption,
    duplicate: true,
    customerId,
    passive: { requested: 0, credited: 0, capped: false, combinedMultiplier: 1, happyHourId: null, seasonalCampaignId: null },
  };
}

/**
 * Tüketim kaydı oluşturur (doğrulama → kart → idempotency → oran sınırı → ürün →
 * çarpanlar → TEK transaction: kayıt + denetim + bildirim + mintPoints + klan puanı).
 *
 * @throws ConsumptionError (route `httpStatus` ile yanıtlar), EconomyError (mint girdisi).
 */
export async function createConsumption(
  rawInput: unknown,
  ctx: CreateConsumptionContext
): Promise<CreateConsumptionResult> {
  const parsed = consumptionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ConsumptionError('VALIDATION', parsed.error.errors[0]?.message ?? 'Geçersiz tüketim verisi', {
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;
  const now = ctx.now ?? new Date();
  const dealerId = ctx.dealerId;

  // 1. Kart.
  const card = await prisma.physicalCard.findUnique({
    where: { token: input.cardToken },
    select: { id: true, status: true, customerId: true, archivedAt: true },
  });
  if (!card) throw new ConsumptionError('CARD_NOT_FOUND', 'Kart bulunamadı');
  if (card.status === 'BLOCKED') throw new ConsumptionError('CARD_BLOCKED', 'Bu kart bloklanmış');
  if (card.archivedAt) throw new ConsumptionError('CARD_ARCHIVED', 'Bu kart arşivlenmiş');
  if (card.status !== 'ACTIVATED' || !card.customerId) {
    throw new ConsumptionError('CARD_NOT_ACTIVATED', 'Bu kart henüz aktive edilmemiş');
  }
  const customerId = card.customerId;
  if (customerId === dealerId) {
    throw new ConsumptionError('SELF_DEALING', 'Kendi kartınıza tüketim kaydedemezsiniz');
  }

  // 2. İdempotency: aynı clientOpId tekrar gelirse (ağ kopması, offline tekrar oynatma)
  //    yeni kayıt/puan yok — oran sınırını da yakmadan ilk sonucu döndür.
  if (input.clientOpId) {
    const existing = await findExistingByClientOp(dealerId, input.clientOpId);
    if (existing) return duplicateResult(existing, card.id);
  }

  // 3. Oran sınırı (kart + bayi).
  if (ctx.rateLimit !== false) {
    const rl = await checkRateLimitDb(
      `consumption:${card.id}_${dealerId}`,
      CONSUMPTION_RATE_LIMIT_MAX,
      CONSUMPTION_RATE_LIMIT_WINDOW_MS
    );
    if (!rl.ok) {
      throw new ConsumptionError('RATE_LIMITED', 'Çok hızlı! Lütfen biraz bekleyin.', {
        retryAfterSec: Math.max(1, Math.ceil((rl.retryAfterMs ?? 1000) / 1000)),
      });
    }
  }

  // 4. Ürün (bu bayiye ait ya da global).
  let product: { id: string; name: string; price: number | null; dealerId: string | null } | null = null;
  if (input.productId) {
    product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: { id: true, name: true, price: true, dealerId: true },
    });
    if (!product) throw new ConsumptionError('PRODUCT_NOT_FOUND', 'Ürün bulunamadı');
    if (product.dealerId && product.dealerId !== dealerId) {
      throw new ConsumptionError('PRODUCT_FORBIDDEN', 'Bu ürüne erişim yetkiniz yok');
    }
  }
  const amount =
    input.amount ?? (product?.price !== null && product?.price !== undefined && Number.isFinite(product.price) ? product.price : null);

  // 5. Çarpanlar: bayinin + global mutlu saatleri (İstanbul duvar saati, [1,3]) ve müşteriye
  //    uygun sezon kampanyası. Okumalar tx öncesi (kısa transaction).
  const happyHours = await prisma.happyHour.findMany({
    where: { isActive: true, OR: [{ dealerId }, { dealerId: null }] },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      daysOfWeek: true,
      isActive: true,
      validFrom: true,
      validUntil: true,
      multiplier: true,
    },
    take: 100,
  });
  const hh = getLiveHappyHourMultiplier(happyHours, now);
  const seasonal = await getActiveSeasonalCampaign(now, prisma, customerId);
  const breakdown = computePassivePoints({
    amount,
    happyHourMultiplier: hh.multiplier,
    seasonalMultiplier: seasonal?.multiplier ?? 1,
    seasonalBonus: seasonal?.bonusPoints ?? 0,
  });

  // 6. Tek transaction.
  try {
    const { consumption, mint } = await prisma.$transaction(async (tx) => {
      const created = await tx.consumption.create({
        data: {
          cardId: card.id,
          customerId,
          dealerId,
          productId: product?.id ?? null,
          amount,
          note: input.note,
          clientOpId: input.clientOpId,
        },
        select: CONSUMPTION_RESPONSE_SELECT,
      });

      await tx.cardAuditLog.create({
        data: {
          cardId: card.id,
          userId: dealerId,
          action: 'CONSUMPTION_ADDED',
          metadata: {
            consumptionId: created.id,
            productId: product?.id ?? null,
            amount: created.amount,
            channel: ctx.channel,
            clientOpId: input.clientOpId,
          },
          ipAddress: ctx.ipAddress ?? null,
          userAgent: ctx.userAgent ?? null,
        },
      });

      await tx.notification.create({
        data: {
          userId: customerId,
          title: 'Yeni Tüketim Kaydı',
          message: product
            ? `${product.name} tüketiminiz kaydedildi. Yorum bırakmayı unutmayın!`
            : 'Yeni bir tüketim kaydınız oluşturuldu. Yorum bırakmayı unutmayın!',
          type: 'info',
          data: { consumptionId: created.id, type: 'consumption_added' },
        },
      });

      let minted: MintResult | null = null;
      if (breakdown.points > 0) {
        minted = await mintPoints(tx, {
          userId: customerId,
          points: breakdown.points,
          xp: 0,
          source: 'dealer_passive',
          sourceId: created.id,
          idempotencyKey: `consumption:${created.id}`,
          actorId: dealerId,
          capCategory: 'dealer_passive',
          reason: 'Tüketim pasif puanı',
          meta: {
            consumptionId: created.id,
            channel: ctx.channel,
            baseXp: breakdown.baseXp,
            happyHourId: hh.happyHourId,
            happyHourMultiplier: breakdown.happyHourMultiplier,
            seasonalCampaignId: seasonal?.campaignId ?? null,
            seasonalMultiplier: breakdown.seasonalMultiplier,
            seasonalBonus: breakdown.seasonalBonus,
            combinedMultiplier: breakdown.combinedMultiplier,
          },
          now,
        });
        // Klan toplamı: yalnız GERÇEKTEN basılan (tavan sonrası, gölge ban hariç) puan.
        if (minted.status === 'posted' && !minted.duplicate && minted.credited > 0) {
          const membership = await tx.squadMember.findFirst({
            where: { userId: customerId },
            select: { squadId: true },
          });
          if (membership) {
            await tx.squad.update({
              where: { id: membership.squadId },
              data: { totalPoints: { increment: minted.credited } },
            });
          }
        }
      }
      return { consumption: created, mint: minted };
    });

    return {
      consumption,
      duplicate: false,
      customerId,
      passive: {
        requested: breakdown.points,
        credited: mint?.credited ?? 0,
        capped: mint?.capped ?? false,
        combinedMultiplier: breakdown.combinedMultiplier,
        happyHourId: hh.happyHourId,
        seasonalCampaignId: seasonal?.campaignId ?? null,
      },
    };
  } catch (e) {
    // Aynı clientOpId ile eşzamanlı iki istek: ikincisi @@unique(dealerId, clientOpId) ile
    // düşer, tüm tx geri alınır (puan yok) → ilk kaydı döndür.
    if (input.clientOpId && isUniqueViolation(e)) {
      const existing = await findExistingByClientOp(dealerId, input.clientOpId);
      if (existing) return duplicateResult(existing, card.id);
    }
    throw e;
  }
}

/**
 * Yanıt sonrası yan etkiler (ısı haritası kovası + ziyaret görevleri). Hata yutulur ve
 * loglanır — tüketim kaydı zaten commit'lendi. Route bunu `after()` içinde çağırmalı.
 */
export async function runConsumptionSideEffects(params: {
  dealerId: string;
  customerId: string;
  revenue: number;
  at: Date;
}): Promise<void> {
  await Promise.all([
    import('@/lib/heatmap-track')
      .then(({ recordHeatmapHit }) => recordHeatmapHit(params.dealerId, params.at, params.revenue))
      .catch((err) => console.error('[HEATMAP] consumption track failed:', err)),
    import('@/lib/visit-missions')
      .then(({ advanceVisitMissions }) => advanceVisitMissions(params.customerId, params.dealerId))
      .catch((err) => console.error('[VISIT_MISSION] advance failed:', err)),
  ]);
}
