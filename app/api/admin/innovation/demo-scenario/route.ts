import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { utcMondayWeekStart } from '@/lib/innovation-week';
import { dealerFlashGeoKey } from '@/lib/innovation-geo';
import { computeWeeklyBriefForDealer } from '@/lib/innovation-weekly-brief';
import { buildInnovationDemoScenario } from '@/lib/innovation-demo-scenario';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  dealerId: z.string().min(1),
  /** true: demo-package ile aynı seed (DB yazılır) */
  runSeed: z.boolean().optional(),
});

/**
 * 120 sn hedefli adım adım senaryo + isteğe bağlı canlı seed (demo-package ile aynı).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'dealerId gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const { dealerId, runSeed } = parsed.data;

  const dealer = await prisma.user.findFirst({
    where: { id: dealerId, role: 'DEALER' },
    select: { id: true, latitude: true, longitude: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: 'Bayi bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const scenario = buildInnovationDemoScenario(dealerId);

  if (!runSeed) {
    return NextResponse.json({
      ...scenario,
      seeded: null,
      note: 'runSeed: true ile veritabanına demo paketi yazılır.',
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  const now = new Date();
  const validTo = new Date(now.getTime() + 30 * 60 * 1000);
  let geohash5: string | null = null;
  if (dealer.latitude != null && dealer.longitude != null) {
    geohash5 = dealerFlashGeoKey(dealer.latitude, dealer.longitude);
  }

  const [pulse, flash, briefComputed] = await Promise.all([
    prisma.tablePulse.create({
      data: {
        dealerId,
        mood: 'OK',
        tableCode: 'DEMO120',
        note: '120 sn senaryo — sessiz sinyal',
      },
    }),
    prisma.dealerFlashOffer.create({
      data: {
        dealerId,
        title: 'Senaryo: Mutlu saat %15',
        body: 'Canlı simülasyon flash örneği — 30 dk içinde biter.',
        offerType: 'PERCENT',
        value: 15,
        validFrom: now,
        validTo,
        isActive: true,
        maxRedemptions: 50,
        geohash5,
      },
    }),
    computeWeeklyBriefForDealer(dealerId),
  ]);

  const weekStart = utcMondayWeekStart();
  const brief = await prisma.dealerWeeklyBrief.upsert({
    where: { dealerId_weekStart: { dealerId, weekStart } },
    create: {
      dealerId,
      weekStart,
      topThemes: briefComputed.topThemes as object,
      recommendedAction: briefComputed.recommendedAction,
    },
    update: {
      topThemes: briefComputed.topThemes as object,
      recommendedAction: briefComputed.recommendedAction,
    },
  });

  const proposal = await prisma.segmentCampaignProposal.create({
    data: {
      dealerId,
      segmentKey: 'first_visit',
      title: 'Senaryo: İlk ziyaret kampanyası',
      message: '120 sn demo — segment taslağı metni.',
      status: 'PENDING',
    },
  });

  return NextResponse.json({
    ...scenario,
    seeded: {
      tablePulseId: pulse.id,
      flashOfferId: flash.id,
      weeklyBriefId: brief.id,
      segmentProposalId: proposal.id,
    },
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
