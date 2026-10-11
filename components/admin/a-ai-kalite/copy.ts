'use client';

/**
 * a-ai-kalite arayüz metinleri (TR/EN). Bileşenler `useAdminAiKaliteCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminAiKaliteText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  revealReason: 'Gerekçe (ör. kötüye kullanım incelemesi, KVKK talebi no)',
  revealNote: 'Maskesiz metin yalnız bu kayıt için gösterilir; kim, ne zaman, hangi gerekçeyle baktı denetim kaydına yazılır.',
  userPrefix: 'Kullanıcı:',
  slow: '(yavaş)',
  maskList: 'E-posta, telefon, IBAN, kart ve kimlik numaraları listede, detayda ve dışa aktarmada maskelenir.',
  auditList: 'Her detay açılışı, maskesiz görüntüleme (gerekçeli) ve dışa aktarma denetim kaydına yazılır.',
  dailyVolume: 'Günlük sohbet hacmi',
  day: 'Gün',
  noThemes: 'AI tema üretmemiş',
  noActions: 'AI aksiyon önermemiş',
  maskedNote: 'E-posta, telefon, IBAN ve kimlik numaraları maskelenmiştir.',
  fieldReview: 'Alan bazlı değerlendirme',
  voidReason: 'Neden geçersiz? (spam, boş metin, yanlış dil…)',
  voidNote: 'Geçersiz örnek metriğe girmez; skoru varsa silinmez, denetim kaydında kalır.',
  rawOutput: 'Ham AI çıktısı (geliştirici görünümü)',
  history: 'Geçmiş',
  outOfFive: '/ 5 yıldız',
  accuracyByModel: 'Model bazında doğruluk',
  accuracyByField: 'Alan bazında doğruluk',
  accuracy: 'Doğruluk',
};

export type AdminAiKaliteCopy = Record<keyof typeof tr, string>;

const en: AdminAiKaliteCopy = {
  revealReason: 'Reason (e.g. abuse review, KVKK request no.)',
  revealNote: 'The unmasked text is shown for this record only. Who looked, when and why is written to the audit log.',
  userPrefix: 'User:',
  slow: '(slow)',
  maskList: 'Email addresses, phone, IBAN, card and ID numbers are masked in the list, the detail view and exports.',
  auditList: 'Every detail view, unmasked view (with a reason) and export is written to the audit log.',
  dailyVolume: 'Daily chat volume',
  day: 'Day',
  noThemes: 'AI produced no themes',
  noActions: 'AI suggested no actions',
  maskedNote: 'Email addresses, phone, IBAN and ID numbers are masked.',
  fieldReview: 'Field-by-field review',
  voidReason: 'Why is it invalid? (spam, empty text, wrong language…)',
  voidNote: 'Invalid samples are left out of the metric. Any existing score is kept in the audit log, not deleted.',
  rawOutput: 'Raw AI output (developer view)',
  history: 'History',
  outOfFive: '/ 5 stars',
  accuracyByModel: 'Accuracy by model',
  accuracyByField: 'Accuracy by field',
  accuracy: 'Accuracy',
};

export function useAdminAiKaliteCopy(): AdminAiKaliteCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminAiKaliteText({ k }: { k: keyof AdminAiKaliteCopy }): string {
  return useAdminAiKaliteCopy()[k];
}
