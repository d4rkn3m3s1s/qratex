/**
 * Admin: segment + deney için hazır playbook şablonları (statik kütüphane).
 * İleride DB’ye taşınabilir; şimdilik hızlı operasyon rehberi.
 */

export interface GrowthPlaybook {
  id: string;
  title: string;
  summary: string;
  segmentHint: string;
  triggers: string[];
  dealerActions: string[];
  customerIdeas: string[];
  metricsToWatch: string[];
}

export const GROWTH_PLAYBOOKS: GrowthPlaybook[] = [
  {
    id: 'low_nps_churn',
    title: 'Düşük NPS + churn sinyali',
    summary: 'Son dönemde düşen memnuniyet ve churn riski birlikte görülüyorsa telafi + iletişim önceliği.',
    segmentHint: 'rating <= 2 veya sentiment negative; churnRisk > 0.5',
    triggers: ['Negatif geri bildirim artışı', 'Tekrar ziyaret düşüşü', 'Telafi kabul oranı düşük'],
    dealerActions: [
      '24 saat içinde düşük puanlı geri bildirimlere kişisel yanıt',
      'Telafi onay kuyruğundan standart şablonları yayınla',
      'Kampanyada “geri gel” mesajı + küçük puan ödülü',
    ],
    customerIdeas: [
      'Haftalık “geri bildirim + ziyaret” mini görevi (3 adım)',
      'Sürpriz kutu şansını düşük NPS kohortuna bağlama (admin onayı ile)',
    ],
    metricsToWatch: ['dealerRepliedAt SLA', 'remedy acceptance', '7 günlük tekrar ziyaret'],
  },
  {
    id: 'first_week_dropoff',
    title: 'İlk 7 gün drop-off',
    summary: 'Yeni müşteri veya yeni kart aktivasyonu sonrası ilk haftada etkileşim düşüyorsa onboarding güçlendirilir.',
    segmentHint: 'kayıt sonrası 7 gün; quest tamamlama < %40',
    triggers: ['İlk tarama sonrası tüketim yok', 'Quest başladı ama bitmedi'],
    dealerActions: [
      'İlk tüketime özel küçük ödül kampanyası',
      'QR yanına “ilk ziyaret bonusu” mesajı',
    ],
    customerIdeas: [
      '“İlk hafta görev kartı” — 3 basit görev (tarama, yorum, paylaşım)',
    ],
    metricsToWatch: ['D1/D7 retention', 'ilk consumption süresi'],
  },
  {
    id: 'silent_happy',
    title: 'Sessiz memnunlar (yüksek tüketim, düşük ses)',
    summary: 'Memnun ama geri bildirim yazmayan kohort; NPS ölçümü ve hafif teşvik.',
    segmentHint: 'yüksek consumption, düşük feedback count',
    triggers: ['Tüketim var, son 30 günde 0 geri bildirim'],
    dealerActions: [
      'QR sonrası tek soruluk anket (1-5 + isteğe bağlı metin)',
      'Sadakat puanı hatırlatma bildirimi',
    ],
    customerIdeas: [
      'Tek tıkla “hızlı emoji” geri bildirimi + küçük puan',
    ],
    metricsToWatch: ['feedback / consumption oranı', 'NPS örneklem boyutu'],
  },
];

export function getPlaybookById(id: string): GrowthPlaybook | undefined {
  return GROWTH_PLAYBOOKS.find((p) => p.id === id);
}

export type PlaybookDraftCampaign = {
  title: string;
  message: string;
  targetSegment: 'risk' | 'vip' | 'loyal' | 'active' | 'all';
  channel: 'notification';
  status: 'draft';
};

export type PlaybookDraftQuest = {
  name: string;
  description: string;
  icon: string;
  type: 'weekly';
  requirement: { type: string; count: number };
  reward: { points: number; xp: number };
  isActive: boolean;
};

export function buildPlaybookDrafts(
  pb: GrowthPlaybook,
  opts?: { dealerLabel?: string }
): { campaign: PlaybookDraftCampaign; quest: PlaybookDraftQuest } {
  const label = opts?.dealerLabel?.trim() || 'İşletmeniz';
  const campaign: PlaybookDraftCampaign = {
    title: `${pb.title} — ${label}`,
    message: `${pb.summary}\n\n${pb.dealerActions.slice(0, 2).join('\n• ')}\n\nPlaybook: ${pb.id}`,
    targetSegment:
      pb.id === 'low_nps_churn' ? 'risk' : pb.id === 'silent_happy' ? 'loyal' : pb.id === 'first_week_dropoff' ? 'active' : 'all',
    channel: 'notification',
    status: 'draft',
  };

  const quest: PlaybookDraftQuest = {
    name: `Playbook: ${pb.title}`,
    description: pb.customerIdeas[0] || pb.summary,
    icon: '🎯',
    type: 'weekly',
    requirement: { type: 'give_feedback', count: pb.id === 'first_week_dropoff' ? 2 : 3 },
    reward: { points: 120, xp: 60 },
    isActive: true,
  };

  return { campaign, quest };
}
