'use client';

import { useDsLocale } from '@/components/ds/a11y/copy';

/** Prompt stüdyosu — arayüz metinleri (TR/EN). */
const tr = {
  noDealerEdits: 'Bayi henüz AI analizini düzeltmemiş.',
  riskPatterns: 'Risk kalıpları',
  avoid: 'Kaçın',
  bothEmpty: 'İki metin de boş.',
  noItems: 'Öğe yok.',
  toRemove: 'Kaldırılacak: ',
  showContent: 'İçeriği göster',
  rejectNeedsReason: 'Reddetmek için gerekçe yazın.',
  current: 'Şu an:',
  catalogNotes: 'Katalog notları',
  usageCaption: 'Model başına son 7 gün kullanım',
  calls: 'Çağrı',
  tokens: 'Token (girdi / çıktı)',
  showText: 'Metni göster',
  liveText: 'Yayındaki metin',
  liveTextLabel: (title: string) => `${title} yayındaki metin`,
  noLiveNote: 'Yayında not yok; yalnız temel prompt ve onaylı öğrenilen kurallar kullanılıyor.',
  compiledContext: 'Derlenmiş ek bağlam (temel promptun sonuna eklenen blok)',
  dryRunNote: 'LLM çağrısı yapılmadı; yalnız prompt kurucusu taslağınızla çalıştırıldı. Satır temizleme ve uzunluk tavanı burada görünür.',
  versionHistory: 'Sürüm geçmişi',
  displayName: 'Görünen ad',
  displayNameHint: 'Bayi kural ekranında bu ad görünür.',
  previewNote: 'Gerçek otomatik yanıt sistem mesajı taslağınızla derlenir ve AI geçidinden (limit + günlük tavan + kullanım kaydı) bir yanıt üretilir.',
  sampleReview: 'Örnek yorum',
  showSystemMsg: 'Gönderilen sistem mesajını göster',
};

type Copy = typeof tr;

const en: Copy = {
  noDealerEdits: 'This dealer hasn’t corrected any AI analysis yet.',
  riskPatterns: 'Risk patterns',
  avoid: 'Avoid',
  bothEmpty: 'Both texts are empty.',
  noItems: 'No items.',
  toRemove: 'To be removed: ',
  showContent: 'Show content',
  rejectNeedsReason: 'Write a reason to reject.',
  current: 'Current:',
  catalogNotes: 'Catalog notes',
  usageCaption: 'Usage per model, last 7 days',
  calls: 'Calls',
  tokens: 'Tokens (input / output)',
  showText: 'Show text',
  liveText: 'Live text',
  liveTextLabel: (title) => `${title} live text`,
  noLiveNote: 'No live note; only the base prompt and approved learned rules are in use.',
  compiledContext: 'Compiled extra context (block appended to the base prompt)',
  dryRunNote: 'No LLM call was made; only the prompt builder ran with your draft. Line cleanup and the length cap are visible here.',
  versionHistory: 'Version history',
  displayName: 'Display name',
  displayNameHint: 'Dealers see this name on their rules screen.',
  previewNote: 'The real auto-reply system message is built from your draft, and a reply is generated through the AI gateway (rate limit + daily cap + usage log).',
  sampleReview: 'Sample review',
  showSystemMsg: 'Show the system message sent',
};

export const PROMPT_STUDIO_COPY = { tr, en } as const;

export function usePromptStudioCopy(): Copy {
  return PROMPT_STUDIO_COPY[useDsLocale()];
}
