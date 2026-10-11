'use client';

/**
 * a-geri-bildirimler arayüz metinleri (TR/EN). Bileşenler `useAdminGeriBildirimlerCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminGeriBildirimlerText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  noDealerMatch: 'Eşleşen bayi yok.',
  ratingOnly: 'Müşteri yalnız puan verdi, yorum yazmadı.',
  suggestedActions: 'Önerilen aksiyonlar (bayiye)',
  noAi: 'Bu kayıt için kayıtlı bir yapay zekâ analizi yok.',
  noRemedy: 'Bu yoruma telafi teklifi yapılmadı.',
  noModeration: 'Bu kayıtta henüz moderasyon işlemi yapılmadı.',
  ratingNoComment: 'Yalnız puan, yorum yok',
  npsQrOnly: 'NPS (yalnız QR)',
  audited: '(denetim kaydına yazılır)',
};

export type AdminGeriBildirimlerCopy = Record<keyof typeof tr, string>;

const en: AdminGeriBildirimlerCopy = {
  noDealerMatch: 'No matching dealers.',
  ratingOnly: 'The customer left a rating without a comment.',
  suggestedActions: 'Suggested actions (for the dealer)',
  noAi: 'There\'s no saved AI analysis for this record.',
  noRemedy: 'No remedy was offered for this review.',
  noModeration: 'No moderation actions on this record yet.',
  ratingNoComment: 'Rating only, no comment',
  npsQrOnly: 'NPS (QR only)',
  audited: '(written to the audit log)',
};

export function useAdminGeriBildirimlerCopy(): AdminGeriBildirimlerCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminGeriBildirimlerText({ k }: { k: keyof AdminGeriBildirimlerCopy }): string {
  return useAdminGeriBildirimlerCopy()[k];
}
