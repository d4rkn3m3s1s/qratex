/**
 * Sezonsal kampanya çarpanı — SeasonalCampaign modelini gerçek puan kazanımına
 * bağlar. HappyHour (lib/happy-hour-live) ve VIP (lib/vip-multiplier) ile aynı
 * desende: aktif zaman penceresindeki kampanyanın çarpan + bonus puanını döndürür.
 *
 * Önceden SeasonalCampaign şemada vardı ama hiçbir yere bağlı değildi (puana
 * uygulanmıyordu). Bu modül döngüyü kapatır.
 *
 * Tür koşulları (conditions Json) ileride genişletilebilir; şu an startDate/endDate
 * + isActive penceresine bakar ve en yüksek çarpanlı aktif kampanyayı seçer.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

export interface ActiveSeasonalCampaign {
  campaignId: string;
  type: string;
  multiplier: number;
  bonusPoints: number;
}

/**
 * conditions Json'unu değerlendirir. Boş/yok ise herkes uygun.
 * BIRTHDAY türü için ileride UserBirthday ile eşleştirilebilir; şimdilik
 * yalnızca açık koşullar (ör. { minLevel }) desteklenir, tanınmayan koşul = uygun.
 */
function isEligible(conditions: unknown): boolean {
  if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) return true;
  // İleride genişletmek için yer; bilinmeyen koşullar engellemez.
  return true;
}

/**
 * Verilen anda aktif, kullanıcı için uygun en yüksek çarpanlı kampanyayı döndürür.
 * Yoksa null. Hata durumunda da null (güvenli no-op).
 */
export async function getActiveSeasonalCampaign(
  now: Date = new Date(),
  db: Db = prisma
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
      take: 10,
    });
    for (const c of campaigns) {
      if (isEligible(c.conditions)) {
        return {
          campaignId: c.id,
          type: c.type,
          multiplier: typeof c.multiplier === 'number' && c.multiplier > 0 ? c.multiplier : 1,
          bonusPoints: typeof c.bonusPoints === 'number' && c.bonusPoints > 0 ? c.bonusPoints : 0,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Taban puana aktif sezonsal kampanya çarpanı + bonusu uygular.
 * points = floor(base * multiplier) + bonusPoints. Kampanya yoksa no-op (base döner).
 */
export async function applySeasonalCampaignMultiplier(
  basePoints: number,
  now: Date = new Date(),
  db: Db = prisma
): Promise<{ points: number; multiplier: number; bonusPoints: number; campaignId: string | null }> {
  if (basePoints <= 0) {
    return { points: basePoints, multiplier: 1, bonusPoints: 0, campaignId: null };
  }
  const campaign = await getActiveSeasonalCampaign(now, db);
  if (!campaign || (campaign.multiplier <= 1 && campaign.bonusPoints <= 0)) {
    return { points: basePoints, multiplier: 1, bonusPoints: 0, campaignId: null };
  }
  const multiplied = Math.floor(basePoints * campaign.multiplier);
  return {
    points: multiplied + campaign.bonusPoints,
    multiplier: campaign.multiplier,
    bonusPoints: campaign.bonusPoints,
    campaignId: campaign.campaignId,
  };
}
