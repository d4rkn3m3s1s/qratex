/**
 * Sezonsal kampanya çarpanı — SeasonalCampaign modelini gerçek puan kazanımına bağlar.
 * HappyHour (lib/happy-hour-live) ve VIP (lib/vip-multiplier) ile aynı desende: aktif zaman
 * penceresindeki, kullanıcı için UYGUN en yüksek çarpanlı kampanyanın çarpan + bonusunu döndürür.
 *
 * P0-21 düzeltmeleri:
 *  - Hedefleme gerçek: BIRTHDAY yalnız doğum günü bugün olan, ANNIVERSARY yalnız üyelik
 *    yıl dönümü bugün olan kullanıcıya uygulanır. Kullanıcı kimliği verilmeyen çağrıda
 *    hedefli kampanyalar UYGULANMAZ (fail-closed; önceden herkese 2× gidiyordu).
 *  - `conditions` tipli: `{ minLevel?: number }`. Tanınmayan koşul anahtarı = uygun değil
 *    (kampanya bir koşul vaat ediyorsa ve biz onu değerlendiremiyorsak puan basmayız).
 *  - Çarpan [1, 3] ve bonus ≤ 250 okuma anında da kırpılır (canlıdaki eski 10× / 100.000
 *    kayıtlar için savunma derinliği). Şelale toplam tavanı çağıranda: combineMultipliers.
 *
 * Gün karşılaştırması UTC ay/gün ile yapılır (lib/timezone standardı ve /api/birthday ile aynı).
 */
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  MULTIPLIER_CASCADE_MAX,
  clampSeasonalBonus,
  clampSeasonalMultiplier,
} from '@/lib/points-multipliers';

type Db = Prisma.TransactionClient | typeof prisma;

export const SEASONAL_CAMPAIGN_TYPES = ['BIRTHDAY', 'ANNIVERSARY', 'SEASONAL', 'SPECIAL'] as const;
export type SeasonalCampaignType = (typeof SEASONAL_CAMPAIGN_TYPES)[number];

/** Kullanıcı kimliği gerektiren (kişiye özel) kampanya türleri. */
export const TARGETED_CAMPAIGN_TYPES: ReadonlySet<string> = new Set(['BIRTHDAY', 'ANNIVERSARY']);

/** `SeasonalCampaign.conditions` şeması. Bilinmeyen anahtar reddedilir (strict). */
export const seasonalCampaignConditionsSchema = z
  .object({
    minLevel: z
      .number({ invalid_type_error: 'Minimum seviye sayı olmalı' })
      .int('Minimum seviye tam sayı olmalı')
      .min(1, 'Minimum seviye en az 1 olmalı')
      .max(1000, 'Minimum seviye en fazla 1000 olabilir')
      .optional(),
  })
  .strict();

export type SeasonalCampaignConditions = z.infer<typeof seasonalCampaignConditionsSchema>;

export interface ActiveSeasonalCampaign {
  campaignId: string;
  type: string;
  multiplier: number;
  bonusPoints: number;
}

/** Uygunluk için gereken kullanıcı bağlamı. */
export interface SeasonalUserContext {
  userId: string;
  level: number;
  createdAt: Date;
  birthDate: Date | null;
}

function sameUtcMonthDay(a: Date, b: Date): boolean {
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate()) return true;
  // 29 Şubat doğumluların artık olmayan yıllarda 28 Şubat'ta kutlaması.
  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return (
    a.getUTCMonth() === 1 &&
    a.getUTCDate() === 29 &&
    b.getUTCMonth() === 1 &&
    b.getUTCDate() === 28 &&
    !isLeap(b.getUTCFullYear())
  );
}

/**
 * Kampanya bu kullanıcı için şu an uygun mu? Saf fonksiyon (test edilebilir).
 * `user === null` → yalnız hedefsiz (SEASONAL/SPECIAL) ve koşulsuz kampanyalar uygundur.
 */
export function isCampaignEligible(
  campaign: { type: string; conditions: unknown },
  user: SeasonalUserContext | null,
  now: Date
): boolean {
  if (TARGETED_CAMPAIGN_TYPES.has(campaign.type)) {
    if (!user) return false;
    if (campaign.type === 'BIRTHDAY') {
      if (!user.birthDate || Number.isNaN(new Date(user.birthDate).getTime())) return false;
      if (!sameUtcMonthDay(new Date(user.birthDate), now)) return false;
    } else if (campaign.type === 'ANNIVERSARY') {
      const joined = new Date(user.createdAt);
      if (Number.isNaN(joined.getTime())) return false;
      // En az bir tam yıl: kayıt günü "yıl dönümü" değildir.
      if (now.getUTCFullYear() <= joined.getUTCFullYear()) return false;
      if (!sameUtcMonthDay(joined, now)) return false;
    }
  }

  const raw = campaign.conditions;
  if (raw === null || raw === undefined) return true;
  const parsed = seasonalCampaignConditionsSchema.safeParse(raw);
  if (!parsed.success) return false; // değerlendiremediğimiz koşul → puan basma
  const c = parsed.data;
  if (c.minLevel !== undefined) {
    if (!user) return false;
    if (!(user.level >= c.minLevel)) return false;
  }
  return true;
}

async function loadUserContext(userId: string, db: Db): Promise<SeasonalUserContext | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, level: true, createdAt: true, birthday: { select: { birthDate: true } } },
  });
  if (!u) return null;
  return {
    userId: u.id,
    level: typeof u.level === 'number' ? u.level : 1,
    createdAt: u.createdAt,
    birthDate: u.birthday?.birthDate ?? null,
  };
}

/**
 * Verilen anda aktif, kullanıcı için uygun en yüksek çarpanlı kampanyayı döndürür.
 * Yoksa null. Hata durumunda da null (güvenli no-op: kampanya puanı vermemek).
 *
 * @param userId Verilmezse hedefli (BIRTHDAY/ANNIVERSARY/minLevel) kampanyalar elenir.
 */
export async function getActiveSeasonalCampaign(
  now: Date = new Date(),
  db: Db = prisma,
  userId?: string | null
): Promise<ActiveSeasonalCampaign | null> {
  try {
    const campaigns = await db.seasonalCampaign.findMany({
      where: {
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      select: { id: true, type: true, multiplier: true, bonusPoints: true, conditions: true },
      orderBy: { multiplier: 'desc' },
      take: 20,
    });
    if (campaigns.length === 0) return null;

    const needsUser = campaigns.some(
      (c) => TARGETED_CAMPAIGN_TYPES.has(c.type) || (c.conditions !== null && c.conditions !== undefined)
    );
    const user = userId && needsUser ? await loadUserContext(userId, db) : null;

    let best: ActiveSeasonalCampaign | null = null;
    for (const c of campaigns) {
      if (!isCampaignEligible(c, user, now)) continue;
      const candidate: ActiveSeasonalCampaign = {
        campaignId: c.id,
        type: c.type,
        multiplier: clampSeasonalMultiplier(c.multiplier),
        bonusPoints: clampSeasonalBonus(c.bonusPoints),
      };
      // Kırpma sıralamayı değiştirebilir (ör. 10× → 3×): yeniden karşılaştır.
      if (
        !best ||
        candidate.multiplier > best.multiplier ||
        (candidate.multiplier === best.multiplier && candidate.bonusPoints > best.bonusPoints)
      ) {
        best = candidate;
      }
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * Taban puana aktif sezonsal kampanya çarpanı + bonusu uygular.
 * points = floor(base × min(çarpan, şelale tavanı)) + bonus. Kampanya yoksa no-op.
 *
 * @param userId Hedefli kampanyalar için ZORUNLU; verilmezse yalnız genel kampanyalar uygulanır.
 */
export async function applySeasonalCampaignMultiplier(
  basePoints: number,
  now: Date = new Date(),
  db: Db = prisma,
  userId?: string | null
): Promise<{ points: number; multiplier: number; bonusPoints: number; campaignId: string | null }> {
  if (!(basePoints > 0)) {
    return { points: Math.max(0, basePoints || 0), multiplier: 1, bonusPoints: 0, campaignId: null };
  }
  const campaign = await getActiveSeasonalCampaign(now, db, userId);
  if (!campaign || (campaign.multiplier <= 1 && campaign.bonusPoints <= 0)) {
    return { points: basePoints, multiplier: 1, bonusPoints: 0, campaignId: null };
  }
  const multiplier = Math.min(campaign.multiplier, MULTIPLIER_CASCADE_MAX);
  const multiplied = Math.floor(basePoints * multiplier);
  return {
    points: multiplied + campaign.bonusPoints,
    multiplier,
    bonusPoints: campaign.bonusPoints,
    campaignId: campaign.campaignId,
  };
}
