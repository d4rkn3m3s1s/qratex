import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import { utcMondayWeekStart } from '@/lib/innovation-week';
import { dealerFlashGeoKey } from '@/lib/innovation-geo';
import { computeWeeklyBriefForDealer } from '@/lib/innovation-weekly-brief';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  dealerId: z.string().min(1),
});

/**
 * Tenant / bayi demo: örnek masa sinyali, flash, haftalık özet, segment taslağı.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'dealerId gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  const { dealerId } = parsed.data;
  const dealer = await prisma.user.findFirst({
    where: { id: dealerId, role: 'DEALER' },
    select: { id: true, latitude: true, longitude: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: 'Bayi bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
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
        tableCode: 'DEMO',
        note: 'Demo paket — sessiz sinyal örneği',
      },
    }),
    prisma.dealerFlashOffer.create({
      data: {
        dealerId,
        title: 'Demo: Mutlu saat %15',
        body: 'Bu örnek teklif 30 dakika içinde sona erer. Gerçek kampanyada süreyi ve metni düzenleyin.',
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
      title: 'Demo: İlk ziyaret kampanyası',
      message:
        'Bu metin örnektir; admin onayından sonra gerçek gönderim akışına bağlanır.',
      status: 'PENDING',
    },
  });

  return NextResponse.json({
    success: true,
    created: {
      tablePulseId: pulse.id,
      flashOfferId: flash.id,
      weeklyBriefId: brief.id,
      segmentProposalId: proposal.id,
    },
    trainingNotes: [
      'Masa sinyali: POST /api/innovation/table-pulse ile QR veya kiosk entegrasyonu.',
      'Flash: bayi panelinden süre ve indirim tipi düzenlenir; müşteri /api/customer/innovation/nearby ile görür.',
      'Haftalık özet: POST /api/dealer/innovation/weekly-brief ile yenilenir.',
      'Segment taslağı: admin /api/admin/innovation/segment-proposals ile onaylanır.',
    ],
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
