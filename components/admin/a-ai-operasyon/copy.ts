'use client';

/**
 * a-ai-operasyon arayüz metinleri (TR/EN). Bileşenler `useAdminAiOperasyonCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminAiOperasyonText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  suggested: 'Önerilen sorular:',
  send: 'Gönder',
  reasonAudited: 'Gerekçe (denetim kaydına yazılır)',
  dealerOff: 'Bayi ayarı kapalı',
  defaultSetting: '(varsayılan ayar)',
  topSpenders: 'En çok harcayan bayiler (bugün)',
  noCallsToday: 'Bugün bayi adına AI çağrısı yok.',
  noRisk: 'Bu dönemde risk sinyali taşıyan bayi yok.',
  churnRisk: 'Kayıp riski',
  actions: 'İşlemler',
  noThemes: 'Bu dönemde tema çıkarılmış yorum yok.',
  noEntities: 'Bu dönemde varlık çıkarılmış yorum yok.',
  noSuggestions: 'Bu dönemde aksiyon önerisi yok.',
  noSentiment: 'Bu dönemde duygu etiketi yok.',
  sentimentByRating: 'Puana göre duygu dağılımı',
  neutral: 'Nötr',
  noAnalyzed: 'Bu dönemde analiz edilmiş geri bildirim yok.',
};

export type AdminAiOperasyonCopy = Record<keyof typeof tr, string>;

const en: AdminAiOperasyonCopy = {
  suggested: 'Suggested questions:',
  send: 'Send',
  reasonAudited: 'Reason (written to the audit log)',
  dealerOff: 'Off in dealer settings',
  defaultSetting: '(default setting)',
  topSpenders: 'Top-spending dealers (today)',
  noCallsToday: 'No AI calls on behalf of dealers today.',
  noRisk: 'No dealers with risk signals in this period.',
  churnRisk: 'Churn risk',
  actions: 'Actions',
  noThemes: 'No reviews with extracted themes in this period.',
  noEntities: 'No reviews with extracted entities in this period.',
  noSuggestions: 'No suggested actions in this period.',
  noSentiment: 'No sentiment labels in this period.',
  sentimentByRating: 'Sentiment by rating',
  neutral: 'Neutral',
  noAnalyzed: 'No analyzed feedback in this period.',
};

export function useAdminAiOperasyonCopy(): AdminAiOperasyonCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminAiOperasyonText({ k }: { k: keyof AdminAiOperasyonCopy }): string {
  return useAdminAiOperasyonCopy()[k];
}
