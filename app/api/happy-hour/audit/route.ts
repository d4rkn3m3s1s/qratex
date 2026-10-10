import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { HHMM_RE, normalizeDaysOfWeek } from '@/lib/happy-hour-live';
import {
  HAPPY_HOUR_MULTIPLIER_MAX,
  HAPPY_HOUR_MULTIPLIER_MIN,
  SEASONAL_BONUS_MAX,
  SEASONAL_MULTIPLIER_MAX,
  clampHappyHourMultiplier,
  clampSeasonalBonus,
  clampSeasonalMultiplier,
} from '@/lib/points-multipliers';
import { seasonalCampaignConditionsSchema } from '@/lib/seasonal-campaign-live';

export const dynamic = 'force-dynamic';

/**
 * GET /api/happy-hour/audit (yalnız ADMIN, SALT OKUNUR) — P0-13 / P0-21 [VERİ] raporu.
 *
 * Politika öncesi yazılmış ve bugünkü sınırların dışında kalan kayıtları listeler:
 *  - HappyHour: çarpan ∉ [1, 3], bozuk SS:dd, başlangıç = bitiş, bozuk gün listesi.
 *  - SeasonalCampaign: çarpan > 3, bonus > 250, tanınmayan `conditions`.
 * Bu kayıtlar puan hesabında zaten kırpılıyor (`effective*` alanları gerçekte uygulanan
 * değer); rapor, admin'in kaydı düzeltmesi/arşivlemesi içindir. Hiçbir şey yazılmaz.
 */
export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  try {
    const [happyHours, campaigns] = await Promise.all([
      prisma.happyHour.findMany({
        select: {
          id: true,
          dealerId: true,
          name: true,
          multiplier: true,
          startTime: true,
          endTime: true,
          daysOfWeek: true,
          isActive: true,
          dealer: { select: { businessName: true, email: true } },
        },
        orderBy: { multiplier: 'desc' },
        take: 5000,
      }),
      prisma.seasonalCampaign.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          multiplier: true,
          bonusPoints: true,
          conditions: true,
          isActive: true,
          startDate: true,
          endDate: true,
        },
        orderBy: { multiplier: 'desc' },
        take: 2000,
      }),
    ]);

    const happyHourViolations = happyHours
      .map((hh) => {
        const issues: string[] = [];
        if (!(hh.multiplier >= HAPPY_HOUR_MULTIPLIER_MIN && hh.multiplier <= HAPPY_HOUR_MULTIPLIER_MAX)) {
          issues.push(`Çarpan ${hh.multiplier} — izin verilen aralık ${HAPPY_HOUR_MULTIPLIER_MIN}–${HAPPY_HOUR_MULTIPLIER_MAX}`);
        }
        if (!HHMM_RE.test(hh.startTime)) issues.push(`Geçersiz başlangıç saati: ${hh.startTime}`);
        if (!HHMM_RE.test(hh.endTime)) issues.push(`Geçersiz bitiş saati: ${hh.endTime}`);
        if (hh.startTime === hh.endTime) issues.push('Başlangıç ve bitiş saati aynı');
        const rawDays = Array.isArray(hh.daysOfWeek) ? hh.daysOfWeek : [];
        if (rawDays.length === 0 || normalizeDaysOfWeek(rawDays).length !== new Set(rawDays).size) {
          issues.push('Gün listesi boş ya da 0–6 dışında değer içeriyor');
        }
        return issues.length
          ? {
              id: hh.id,
              name: hh.name,
              dealerId: hh.dealerId,
              dealerName: hh.dealer?.businessName ?? null,
              isActive: hh.isActive,
              storedMultiplier: hh.multiplier,
              effectiveMultiplier: clampHappyHourMultiplier(hh.multiplier),
              issues,
            }
          : null;
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    const campaignViolations = campaigns
      .map((c) => {
        const issues: string[] = [];
        if (c.multiplier > SEASONAL_MULTIPLIER_MAX || !(c.multiplier >= 1)) {
          issues.push(`Çarpan ${c.multiplier} — izin verilen aralık 1–${SEASONAL_MULTIPLIER_MAX}`);
        }
        if (c.bonusPoints > SEASONAL_BONUS_MAX || c.bonusPoints < 0) {
          issues.push(`Bonus ${c.bonusPoints} — üst sınır ${SEASONAL_BONUS_MAX}`);
        }
        if (c.conditions !== null && !seasonalCampaignConditionsSchema.safeParse(c.conditions).success) {
          issues.push('Tanınmayan koşul — kampanya hiçbir kullanıcıya uygulanmaz');
        }
        return issues.length
          ? {
              id: c.id,
              name: c.name,
              type: c.type,
              isActive: c.isActive,
              startDate: c.startDate,
              endDate: c.endDate,
              storedMultiplier: c.multiplier,
              effectiveMultiplier: clampSeasonalMultiplier(c.multiplier),
              storedBonus: c.bonusPoints,
              effectiveBonus: clampSeasonalBonus(c.bonusPoints),
              issues,
            }
          : null;
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    return NextResponse.json(
      {
        success: true,
        policy: {
          happyHourMultiplier: [HAPPY_HOUR_MULTIPLIER_MIN, HAPPY_HOUR_MULTIPLIER_MAX],
          seasonalMultiplierMax: SEASONAL_MULTIPLIER_MAX,
          seasonalBonusMax: SEASONAL_BONUS_MAX,
        },
        scanned: { happyHours: happyHours.length, seasonalCampaigns: campaigns.length },
        happyHours: happyHourViolations,
        seasonalCampaigns: campaignViolations,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Happy hour policy audit error:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { error: 'Politika raporu alınamadı' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
