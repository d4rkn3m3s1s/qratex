/**
 * Keşfet → Fırsatlar: mutlu saatler + sezonluk etkinlikler (+ görev) + kısa süreli teklifler +
 * "sana özel" kampanya mesajları — tek akış. Ayrıca etkinlik görevi ödül talebi.
 *
 * Etkinlik düzeltmeleri (denetim: customer_event):
 *  - Çoğul: kullanıcıya UYGUN tüm aktif etkinlikler listelenir (önceden yalnız en yüksek
 *    çarpanlı tek kampanya; düşük çarpanlı ama görevli etkinlik görünmez/talep edilemezdi).
 *  - Uygunluk gerçek (lib/seasonal-campaign-live#isCampaignEligible): BIRTHDAY herkese gösterilmez.
 *  - Bitişten sonra TALEP SÜRESİ (CLAIM_GRACE_MS): son gün hedefe ulaşan ödülünü kaybetmez;
 *    sayım penceresi yine startDate..endDate.
 *  - Ödül `lib/economy#mintPoints` ile (tek-kez anahtarı + defter + points_credited, gölge-ban
 *    kapısı) ve `SeasonalChallengeClaim @@unique` ile iki katmanlı tek-kez; puan kadar XP de verilir.
 *  - Silinmiş/geçersiz rozet id'si ödülü düşürmez (awardBadgeInTx → BADGE_NOT_FOUND atlanır).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { mintPoints } from '@/lib/economy';
import { isCampaignEligible, type SeasonalUserContext } from '@/lib/seasonal-campaign-live';
import { parseChallengeSpec, type ChallengeSpec } from '@/lib/seasonal-event-core';
import { clampSeasonalBonus, clampSeasonalMultiplier } from '@/lib/points-multipliers';
import { HAPPY_HOUR_TIME_ZONE } from '@/lib/happy-hour-live';
import { isValidLatLng } from './geo';
import { loadFlashOffers, loadHappyHours, toHappyHourDto, type PlacesDb } from './data.server';
import type { DealsResponse, PersonalOfferDto, SeasonalEventDto, UpcomingEventDto } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Etkinlik bittikten sonra görev ödülünün talep edilebildiği süre. */
export const CLAIM_GRACE_MS = 3 * DAY_MS;
/** Görev ödülü üst sınırı (savunma derinliği; mintPoints tek seferlik tavanının çok altında). */
export const CHALLENGE_REWARD_MAX = 1000;
/** Sezon çarpanının uygulandığı kazanımlar: app/api/feedbacks (geri bildirim) + lib/consumption/service (kartlı harcama). */
export const SEASONAL_APPLIES_TO: Array<'feedback' | 'consumption'> = ['feedback', 'consumption'];
const UPCOMING_HORIZON_MS = 30 * DAY_MS;
const PERSONAL_WINDOW_MS = 30 * DAY_MS;
const FLASH_RADIUS_KM = 15;

const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  description: true,
  type: true,
  multiplier: true,
  bonusPoints: true,
  imageUrl: true,
  conditions: true,
  isActive: true,
  startDate: true,
  endDate: true,
  challengeType: true,
  challengeGoal: true,
  challengeRewardPoints: true,
  challengeRewardBadgeId: true,
} satisfies Prisma.SeasonalCampaignSelect;

type CampaignRow = Prisma.SeasonalCampaignGetPayload<{ select: typeof CAMPAIGN_SELECT }>;

async function loadUserContext(db: PlacesDb, userId: string): Promise<SeasonalUserContext | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, level: true, createdAt: true, birthday: { select: { birthDate: true } } },
  });
  if (!u) return null;
  return { userId: u.id, level: typeof u.level === 'number' ? u.level : 1, createdAt: u.createdAt, birthDate: u.birthday?.birthDate ?? null };
}

/** Görev ilerlemesi — etkinlik penceresinde tamamlanan oyun / yazılan tüketim yorumu. */
export async function countChallengeProgress(db: PlacesDb | Prisma.TransactionClient, userId: string, spec: ChallengeSpec, from: Date, to: Date): Promise<number> {
  if (spec.type === 'games_played') {
    return db.miniGameSession.count({ where: { userId, status: 'completed', completedAt: { gte: from, lte: to } } });
  }
  return db.consumptionReview.count({ where: { customerId: userId, deletedAt: null, createdAt: { gte: from, lte: to } } });
}

function rewardPointsOf(spec: ChallengeSpec): number {
  return Math.max(0, Math.min(CHALLENGE_REWARD_MAX, Math.floor(spec.rewardPoints)));
}

/** Kullanıcıya görünür etkinlikler: aktif + talep süresindeki (bitmiş, tamamlanmış, alınmamış). */
export async function loadSeasonalEvents(
  db: PlacesDb,
  userId: string,
  now: Date,
): Promise<{ events: SeasonalEventDto[]; upcoming: UpcomingEventDto[] }> {
  const rows = await db.seasonalCampaign.findMany({
    where: {
      isActive: true,
      startDate: { lte: new Date(now.getTime() + UPCOMING_HORIZON_MS) },
      endDate: { gte: new Date(now.getTime() - CLAIM_GRACE_MS) },
    },
    select: CAMPAIGN_SELECT,
    orderBy: { endDate: 'asc' },
    take: 30,
  });
  if (rows.length === 0) return { events: [], upcoming: [] };
  const user = await loadUserContext(db, userId);

  const upcoming: UpcomingEventDto[] = rows
    .filter((c) => c.startDate > now && (c.type === 'SEASONAL' || c.type === 'SPECIAL'))
    .filter((c) => isCampaignEligible(c, user, c.startDate))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description?.trim() || null,
      multiplier: clampSeasonalMultiplier(c.multiplier),
      bonusPoints: clampSeasonalBonus(c.bonusPoints),
      startDate: c.startDate.toISOString(),
      endDate: c.endDate.toISOString(),
    }));

  const started = rows.filter((c) => c.startDate <= now);
  const visible: Array<{ row: CampaignRow; phase: 'active' | 'ended' }> = [];
  for (const c of started) {
    if (c.endDate >= now) {
      if (isCampaignEligible(c, user, now)) visible.push({ row: c, phase: 'active' });
    } else if (parseChallengeSpec(c)) {
      // Bitti: yalnız görevi olan ve talep süresi içindekiler aday (tamamlanma aşağıda süzülür).
      visible.push({ row: c, phase: 'ended' });
    }
  }
  if (visible.length === 0) return { events: [], upcoming };

  const ids = visible.map((v) => v.row.id);
  const badgeIds = visible.map((v) => v.row.challengeRewardBadgeId).filter((b): b is string => !!b);
  const [claims, badges] = await Promise.all([
    db.seasonalChallengeClaim.findMany({ where: { userId, campaignId: { in: ids } }, select: { campaignId: true } }),
    badgeIds.length > 0
      ? db.badge.findMany({ where: { id: { in: badgeIds } }, select: { id: true, name: true, icon: true } })
      : Promise.resolve([] as Array<{ id: string; name: string; icon: string }>),
  ]);
  const claimed = new Set(claims.map((c) => c.campaignId));
  const badgeById = new Map(badges.map((b) => [b.id, b]));

  const events: SeasonalEventDto[] = [];
  for (const { row, phase } of visible) {
    const spec = parseChallengeSpec(row);
    let challenge: SeasonalEventDto['challenge'] = null;
    if (spec) {
      const current = await countChallengeProgress(db, userId, spec, row.startDate, row.endDate);
      const badge = spec.rewardBadgeId ? badgeById.get(spec.rewardBadgeId) ?? null : null;
      challenge = {
        type: spec.type,
        goal: spec.goal,
        current: Math.max(0, current),
        complete: current >= spec.goal,
        rewardPoints: rewardPointsOf(spec),
        rewardBadge: badge ? { id: badge.id, name: badge.name, icon: badge.icon || null } : null,
        claimed: claimed.has(row.id),
      };
    }
    // Bitmiş etkinlik yalnız alınmamış, tamamlanmış ödül için görünür.
    if (phase === 'ended' && !(challenge && challenge.complete && !challenge.claimed)) continue;
    events.push({
      id: row.id,
      name: row.name,
      description: row.description?.trim() || null,
      type: row.type,
      imageUrl: row.imageUrl && /^(https?:\/\/|\/)/.test(row.imageUrl) ? row.imageUrl : null,
      multiplier: clampSeasonalMultiplier(row.multiplier),
      bonusPoints: clampSeasonalBonus(row.bonusPoints),
      appliesTo: SEASONAL_APPLIES_TO,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      claimDeadline: new Date(row.endDate.getTime() + CLAIM_GRACE_MS).toISOString(),
      phase,
      challenge,
    });
  }
  // Talep edilebilir olanlar önce, sonra en erken biten.
  events.sort((a, b) => {
    const ca = a.challenge && a.challenge.complete && !a.challenge.claimed ? 0 : 1;
    const cb = b.challenge && b.challenge.complete && !b.challenge.claimed ? 0 : 1;
    return ca - cb || a.endDate.localeCompare(b.endDate);
  });
  return { events, upcoming };
}

/** Kullanıcıya gönderilmiş kampanya mesajları (segment önerisi vb.; son 30 gün). */
async function loadPersonalOffers(db: PlacesDb, userId: string, now: Date): Promise<PersonalOfferDto[]> {
  const rows = await db.notification.findMany({
    where: { userId, type: 'campaign', createdAt: { gte: new Date(now.getTime() - PERSONAL_WINDOW_MS) } },
    select: { id: true, title: true, message: true, createdAt: true, data: true, isRead: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const dealerIds = new Set<string>();
  const parsed = rows.map((r) => {
    const data = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? (r.data as Record<string, unknown>) : {};
    const dealerId = typeof data.dealerId === 'string' ? data.dealerId : null;
    if (dealerId) dealerIds.add(dealerId);
    return { r, dealerId, proposalId: typeof data.proposalId === 'string' ? data.proposalId : null };
  });
  const dealers = dealerIds.size
    ? await db.user.findMany({ where: { id: { in: [...dealerIds] }, role: 'DEALER', isDemo: false }, select: { id: true, businessName: true } })
    : [];
  const nameById = new Map(dealers.map((d) => [d.id, d.businessName]));
  return parsed.map(({ r, dealerId, proposalId }) => ({
    id: r.id,
    title: r.title,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
    dealerId: dealerId && nameById.has(dealerId) ? dealerId : null,
    venueName: dealerId ? nameById.get(dealerId) ?? null : null,
    proposalId,
    isRead: r.isRead,
  }));
}

export async function getDeals(
  userId: string,
  opts: { lat?: number | null; lng?: number | null } = {},
  now: Date = new Date(),
  db: PlacesDb = prisma,
): Promise<DealsResponse> {
  const origin = isValidLatLng(opts.lat, opts.lng) ? { lat: opts.lat as number, lng: opts.lng as number } : null;
  const savedRows = await db.customerFavoriteDealer.findMany({ where: { userId }, select: { dealerId: true }, take: 500 });
  const savedDealerIds = savedRows.map((r) => r.dealerId);
  const [hhRows, seasonal, flash, personal] = await Promise.all([
    loadHappyHours(db, now),
    loadSeasonalEvents(db, userId, now),
    loadFlashOffers(db, now, { dealerIds: savedDealerIds, origin, radiusKm: FLASH_RADIUS_KM }),
    loadPersonalOffers(db, userId, now),
  ]);
  return {
    timeZone: HAPPY_HOUR_TIME_ZONE,
    happyHours: hhRows.map((r) => toHappyHourDto(r, origin)),
    events: seasonal.events,
    upcomingEvents: seasonal.upcoming,
    flash,
    personal,
    savedDealerIds,
    located: origin !== null,
  };
}

// ───────────────────────────── Görev ödülü talebi ─────────────────────────────

export type ClaimOutcome =
  | { ok: true; points: number; badgeAwarded: boolean; campaignId: string }
  | { ok: false; code: 'NOT_FOUND' | 'NO_CHALLENGE' | 'NOT_COMPLETE' | 'ALREADY_CLAIMED' | 'CLAIM_EXPIRED' | 'NOT_ELIGIBLE' | 'NOT_STARTED'; message: string };

/**
 * Etkinlik görevi ödülü. `campaignId` verilmezse (eski istemci) kullanıcıya uygun, görevi olan
 * aktif/talep süresindeki ilk etkinlik hedeflenir. Sunucu ilerlemeyi YENİDEN sayar.
 */
export async function claimSeasonalChallenge(
  userId: string,
  campaignId: string | null,
  now: Date = new Date(),
  db: PlacesDb = prisma,
): Promise<ClaimOutcome> {
  let campaign: CampaignRow | null = null;
  if (campaignId) {
    campaign = await db.seasonalCampaign.findUnique({ where: { id: campaignId }, select: CAMPAIGN_SELECT });
  } else {
    const { events } = await loadSeasonalEvents(db, userId, now);
    const target = events.find((e) => e.challenge && !e.challenge.claimed && e.challenge.complete) ?? events.find((e) => e.challenge);
    if (target) campaign = await db.seasonalCampaign.findUnique({ where: { id: target.id }, select: CAMPAIGN_SELECT });
  }
  if (!campaign || !campaign.isActive) return { ok: false, code: 'NOT_FOUND', message: 'Etkinlik bulunamadı.' };
  if (campaign.startDate > now) return { ok: false, code: 'NOT_STARTED', message: 'Etkinlik henüz başlamadı.' };
  if (now.getTime() > campaign.endDate.getTime() + CLAIM_GRACE_MS) {
    return { ok: false, code: 'CLAIM_EXPIRED', message: 'Bu etkinliğin ödül talep süresi doldu.' };
  }
  const spec = parseChallengeSpec(campaign);
  if (!spec) return { ok: false, code: 'NO_CHALLENGE', message: 'Bu etkinlikte görev yok.' };
  // Uygunluk etkinlik penceresinde değerlendirilir (bitişten sonra talepte de aynı karar).
  const user = await loadUserContext(db, userId);
  const at = now > campaign.endDate ? campaign.endDate : now;
  if (!isCampaignEligible(campaign, user, at)) return { ok: false, code: 'NOT_ELIGIBLE', message: 'Bu etkinlik senin için geçerli değil.' };

  const current = await countChallengeProgress(db, userId, spec, campaign.startDate, campaign.endDate);
  if (current < spec.goal) return { ok: false, code: 'NOT_COMPLETE', message: 'Görev henüz tamamlanmadı.' };

  const points = rewardPointsOf(spec);
  const id = campaign.id;
  const result = await db.$transaction(async (tx) => {
    const claim = await tx.seasonalChallengeClaim.createMany({
      data: [{ userId, campaignId: id, points }],
      skipDuplicates: true,
    });
    if (claim.count === 0) return null;
    if (points > 0) {
      await mintPoints(tx, {
        userId,
        points,
        xp: points,
        source: 'seasonal_challenge',
        sourceId: id,
        idempotencyKey: `seasonal_challenge:${id}:${userId}`,
        meta: { campaignId: id, challengeType: spec.type, goal: spec.goal },
        capCategory: null,
        now,
      });
    }
    let badgeAwarded = false;
    if (spec.rewardBadgeId) {
      const { awardBadgeInTx } = await import('@/lib/badges/award');
      const r = await awardBadgeInTx(tx, {
        userId,
        badgeId: spec.rewardBadgeId,
        source: 'seasonal_event',
        reward: 'none',
        requireActive: false,
      });
      badgeAwarded = r.awarded;
    }
    await tx.notification.create({
      data: {
        userId,
        type: 'success',
        title: 'Etkinlik ödülün hesabında',
        message: points > 0 ? `Etkinlik görevini tamamladın: +${points} puan.` : 'Etkinlik görevini tamamladın: ödülün hesabında.',
        data: { kind: 'seasonal_challenge', campaignId: id },
      },
    });
    return { badgeAwarded };
  });
  if (!result) return { ok: false, code: 'ALREADY_CLAIMED', message: 'Bu ödülü zaten aldın.' };
  return { ok: true, points, badgeAwarded: result.badgeAwarded, campaignId: id };
}
