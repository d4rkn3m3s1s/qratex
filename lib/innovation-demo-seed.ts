/**
 * İnovasyon demo paketi tohumu — `/api/admin/innovation/demo-package` ve
 * `/api/admin/innovation/demo-scenario` (runSeed) ORTAK yazıcısı (P0-27).
 *
 * Önceden iki uç kopya kodla HERHANGİ bir gerçek bayiye müşteriye görünen aktif flash
 * teklif ("Demo: Mutlu saat %15"), masa sinyali ve segment taslağı yazıyordu; 15 km içindeki
 * gerçek müşteriler sahte teklifi görüyordu. Artık:
 *  - çağıran uç demo kapısını (`demoSeedGate`) ve hedefin `isDemo=true` olduğunu doğrular,
 *  - yazımlar tek transaction'da yapılır (yarım paket kalmaz).
 */
import { prisma } from '@/lib/prisma';
import { utcMondayWeekStart } from '@/lib/innovation-week';
import { dealerFlashGeoKey } from '@/lib/innovation-geo';
import { computeWeeklyBriefForDealer } from '@/lib/innovation-weekly-brief';

export type InnovationDemoVariant = 'package' | 'scenario';

const COPY: Record<InnovationDemoVariant, {
  tableCode: string;
  pulseNote: string;
  flashTitle: string;
  flashBody: string;
  proposalTitle: string;
  proposalMessage: string;
}> = {
  package: {
    tableCode: 'DEMO',
    pulseNote: 'Demo paket — sessiz sinyal örneği',
    flashTitle: 'Demo: Mutlu saat %15',
    flashBody: 'Bu örnek teklif 30 dakika içinde sona erer. Gerçek kampanyada süreyi ve metni düzenleyin.',
    proposalTitle: 'Demo: İlk ziyaret kampanyası',
    proposalMessage: 'Bu metin örnektir; admin onayından sonra gerçek gönderim akışına bağlanır.',
  },
  scenario: {
    tableCode: 'DEMO120',
    pulseNote: '120 sn senaryo — sessiz sinyal',
    flashTitle: 'Demo: Senaryo mutlu saat %15',
    flashBody: 'Canlı simülasyon flash örneği — 30 dk içinde biter.',
    proposalTitle: 'Demo: Senaryo ilk ziyaret kampanyası',
    proposalMessage: '120 sn demo — segment taslağı metni.',
  },
};

export interface DemoDealer {
  id: string;
  latitude: number | null;
  longitude: number | null;
}

export interface InnovationDemoSeedResult {
  tablePulseId: string;
  flashOfferId: string;
  weeklyBriefId: string;
  segmentProposalId: string;
}

export async function seedInnovationDemoPackage(
  dealer: DemoDealer,
  variant: InnovationDemoVariant
): Promise<InnovationDemoSeedResult> {
  const copy = COPY[variant];
  const now = new Date();
  const validTo = new Date(now.getTime() + 30 * 60 * 1000);
  const geohash5 =
    dealer.latitude != null && dealer.longitude != null ? dealerFlashGeoKey(dealer.latitude, dealer.longitude) : null;

  // Özet hesabı salt okuma; yazımlardan önce yapılır (tx'i uzun tutmamak için).
  const briefComputed = await computeWeeklyBriefForDealer(dealer.id);
  const weekStart = utcMondayWeekStart();

  return prisma.$transaction(async (tx) => {
    const pulse = await tx.tablePulse.create({
      data: { dealerId: dealer.id, mood: 'OK', tableCode: copy.tableCode, note: copy.pulseNote },
    });
    const flash = await tx.dealerFlashOffer.create({
      data: {
        dealerId: dealer.id,
        title: copy.flashTitle,
        body: copy.flashBody,
        offerType: 'PERCENT',
        value: 15,
        validFrom: now,
        validTo,
        isActive: true,
        maxRedemptions: 50,
        geohash5,
      },
    });
    const brief = await tx.dealerWeeklyBrief.upsert({
      where: { dealerId_weekStart: { dealerId: dealer.id, weekStart } },
      create: {
        dealerId: dealer.id,
        weekStart,
        topThemes: briefComputed.topThemes as object,
        recommendedAction: briefComputed.recommendedAction,
      },
      update: {
        topThemes: briefComputed.topThemes as object,
        recommendedAction: briefComputed.recommendedAction,
      },
    });
    const proposal = await tx.segmentCampaignProposal.create({
      data: {
        dealerId: dealer.id,
        segmentKey: 'first_visit',
        title: copy.proposalTitle,
        message: copy.proposalMessage,
        status: 'PENDING',
      },
    });
    return {
      tablePulseId: pulse.id,
      flashOfferId: flash.id,
      weeklyBriefId: brief.id,
      segmentProposalId: proposal.id,
    };
  });
}
