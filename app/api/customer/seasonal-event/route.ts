import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { creditPointsAndXp } from '@/lib/points-wallet';
import { getActiveSeasonalCampaign } from '@/lib/seasonal-campaign-live';
import {
  parseChallengeSpec,
  challengeProgress,
  msUntilEnd,
  type ChallengeType,
} from '@/lib/seasonal-event-core';

export const dynamic = 'force-dynamic';

/** Kullanıcının bir pencere içinde challenge ilerlemesini sayar. */
async function countProgress(userId: string, type: ChallengeType, from: Date, to: Date): Promise<number> {
  if (type === 'games_played') {
    return prisma.miniGameSession.count({
      where: { userId, status: 'completed', completedAt: { gte: from, lte: to } },
    });
  }
  // reviews_written
  return prisma.consumptionReview.count({
    where: { customerId: userId, createdAt: { gte: from, lte: to } },
  });
}

/**
 * GET /api/customer/seasonal-event
 * Şu an aktif sezonluk etkinliği (SeasonalCampaign) + varsa challenge ilerlemesini +
 * geri sayımı döndürür. Aktif etkinlik yoksa { active: false }.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const userId = session.user.id;
    const now = new Date();

    const active = await getActiveSeasonalCampaign(now);
    if (!active) {
      return NextResponse.json({ active: false }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Kampanyanın tam kaydını al (pencere + challenge alanları).
    const campaign = await prisma.seasonalCampaign.findUnique({
      where: { id: active.campaignId },
      select: {
        id: true, name: true, description: true, type: true, multiplier: true, bonusPoints: true,
        startDate: true, endDate: true, imageUrl: true,
        challengeType: true, challengeGoal: true, challengeRewardPoints: true, challengeRewardBadgeId: true,
      },
    });
    if (!campaign) {
      return NextResponse.json({ active: false }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const spec = parseChallengeSpec(campaign);
    let challenge = null as null | {
      type: string; goal: number; current: number; ratio: number; complete: boolean;
      rewardPoints: number; claimed: boolean;
    };
    if (spec) {
      const current = await countProgress(userId, spec.type, campaign.startDate, campaign.endDate);
      const prog = challengeProgress(current, spec.goal);
      const claim = await prisma.seasonalChallengeClaim.findUnique({
        where: { userId_campaignId: { userId, campaignId: campaign.id } },
        select: { id: true },
      });
      challenge = {
        type: spec.type, goal: spec.goal, current: prog.current, ratio: prog.ratio,
        complete: prog.complete, rewardPoints: spec.rewardPoints, claimed: !!claim,
      };
    }

    return NextResponse.json(
      {
        active: true,
        event: {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          type: campaign.type,
          multiplier: campaign.multiplier,
          bonusPoints: campaign.bonusPoints,
          imageUrl: campaign.imageUrl,
          endsInMs: msUntilEnd(campaign.endDate, now),
          endDate: campaign.endDate,
        },
        challenge,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[SEASONAL_EVENT_GET]', error);
    return NextResponse.json({ error: 'Etkinlik alınamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}

/**
 * POST /api/customer/seasonal-event
 * Aktif etkinliğin challenge ödülünü talep eder. Sunucu ilerlemeyi YENİDEN sayar
 * (istemciye güvenmez), hedef tamamsa atomik tek-claim (unique userId+campaignId) +
 * creditPointsAndXp + points_credited (invariant #3) + opsiyonel özel rozet. Tek tx.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Oturum gerekli' }, { status: 401, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const userId = session.user.id;
    const now = new Date();

    const active = await getActiveSeasonalCampaign(now);
    if (!active) {
      return NextResponse.json({ success: false, error: 'Aktif etkinlik yok.' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    const campaign = await prisma.seasonalCampaign.findUnique({
      where: { id: active.campaignId },
      select: {
        id: true, startDate: true, endDate: true,
        challengeType: true, challengeGoal: true, challengeRewardPoints: true, challengeRewardBadgeId: true,
      },
    });
    const spec = campaign ? parseChallengeSpec(campaign) : null;
    if (!campaign || !spec) {
      return NextResponse.json({ success: false, error: 'Bu etkinlikte challenge yok.' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }

    const current = await countProgress(userId, spec.type, campaign.startDate, campaign.endDate);
    if (current < spec.goal) {
      return NextResponse.json(
        { success: false, error: 'Challenge henüz tamamlanmadı.' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.seasonalChallengeClaim.createMany({
        data: [{ userId, campaignId: campaign.id, points: spec.rewardPoints }],
        skipDuplicates: true,
      });
      if (claim.count === 0) return { credited: false as const };

      if (spec.rewardPoints > 0) {
        await creditPointsAndXp(tx, { userId, points: spec.rewardPoints });
        await tx.analyticsEvent.create({
          data: {
            userId, event: 'points_credited', category: 'seasonal_challenge',
            data: { points: spec.rewardPoints, campaignId: campaign.id },
          },
        });
      }
      // Opsiyonel özel rozet (varsa ve daha önce alınmamışsa).
      if (spec.rewardBadgeId) {
        await tx.userBadge.createMany({
          data: [{ userId, badgeId: spec.rewardBadgeId }],
          skipDuplicates: true,
        });
      }
      await tx.notification.create({
        data: {
          userId, type: 'success', title: '🎉 Etkinlik ödülü kazandın!',
          message: spec.rewardPoints > 0 ? `Challenge tamamlandı — +${spec.rewardPoints} puan!` : 'Challenge tamamlandı — özel ödülün hesabında!',
        },
      });
      return { credited: true as const };
    });

    if (!result.credited) {
      return NextResponse.json({ success: false, error: 'Bu ödülü zaten aldın.' }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS });
    }
    return NextResponse.json({ success: true, points: spec.rewardPoints }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[SEASONAL_EVENT_POST]', error);
    return NextResponse.json({ error: 'Ödül talep edilemedi' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
