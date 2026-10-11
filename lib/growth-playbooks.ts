/**
 * Admin: segment + deney için hazır playbook şablonları (statik kütüphane).
 *
 * İki kitleli şema (denetim Bulgu 2): `dealerActions`/`summary` BAYİYE iç rehberdir;
 * müşteriye giden metin YALNIZ `customerTitle`/`customerMessage`'dan üretilir.
 * Hedef kitle `segment` alanındadır (kampanya merkezinin segment anahtarı; denetim Bulgu 3 —
 * id'ye göre `if` zinciri kaldırıldı). Kaynak tek: /admin/dealers-health, weekly digest.
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
  /** Kütüphane kategorisi (kullanıcıya etiketiyle gösterilir). */
  category: 'retention' | 'onboarding' | 'voice';
  /** Kampanya hedef kitlesi — `components/dealer/b-kampanyalar/domain` CAMPAIGN_SEGMENT_KEYS. */
  segment: 'risk' | 'new' | 'loyal';
  /** Müşteriye giden başlık; `{{isletme}}` işletme adıyla değişir. */
  customerTitle: string;
  /** Müşteriye giden mesaj; iç talimat/segment dili İÇERMEZ. */
  customerMessage: string;
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
    metricsToWatch: ['Yanıt süresi', 'Telafi kabul oranı', '7 günlük tekrar ziyaret'],
    category: 'retention',
    segment: 'risk',
    customerTitle: 'Görüşünüz bizim için önemli — {{isletme}}',
    customerMessage:
      'Son ziyaretinizde beklentinizi karşılayamadıysak üzgünüz. Geri bildiriminizi dikkate aldık ve sizi yeniden ağırlamak isteriz. Bir sonraki ziyaretinizde bizi tekrar değerlendirmeyi unutmayın.',
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
    metricsToWatch: ['1. ve 7. gün geri dönüş', 'İkinci ziyarete kadar geçen süre'],
    category: 'onboarding',
    segment: 'new',
    customerTitle: 'Sizi yeniden görmek isteriz — {{isletme}}',
    customerMessage:
      'İlk ziyaretiniz için teşekkürler! Bir sonraki gelişinizde kartınızı okutmayı unutmayın; puanlarınız birikmeye devam etsin.',
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
    metricsToWatch: ['Geri bildirim / ziyaret oranı', 'Değerlendirme sayısı'],
    category: 'voice',
    segment: 'loyal',
    customerTitle: 'Fikriniz bizim için değerli — {{isletme}}',
    customerMessage:
      'Bizi tercih ettiğiniz için teşekkürler. Deneyiminizi bir dakikada puanlarsanız neyi iyi yaptığımızı öğrenir, daha da iyisini sunarız.',
  },
];

export function getPlaybookById(id: string): GrowthPlaybook | undefined {
  return GROWTH_PLAYBOOKS.find((p) => p.id === id);
}

export type PlaybookDraftCampaign = {
  title: string;
  message: string;
  targetSegment: GrowthPlaybook['segment'];
  channel: 'notification';
  status: 'draft';
};

function fillBusiness(template: string, label: string): string {
  return template.replace(/\{\{\s*isletme\s*\}\}/g, label);
}

/**
 * Playbook → MÜŞTERİYE gidecek kampanya taslağı. Bayi rehberi ve playbook kimliği metne
 * yazılmaz (kimlik yalnız `Campaign.playbookSourceId`'de). Global görev üretimi kaldırıldı
 * (denetim Bulgu 1: "taslak" diye canlı ve tamamlanamaz global görev açıyordu).
 */
export function buildPlaybookDrafts(pb: GrowthPlaybook, opts?: { dealerLabel?: string }): { campaign: PlaybookDraftCampaign } {
  const label = opts?.dealerLabel?.trim() || 'İşletmemiz';
  return {
    campaign: {
      title: fillBusiness(pb.customerTitle, label).slice(0, 200),
      message: fillBusiness(pb.customerMessage, label),
      targetSegment: pb.segment,
      channel: 'notification',
      status: 'draft',
    },
  };
}
