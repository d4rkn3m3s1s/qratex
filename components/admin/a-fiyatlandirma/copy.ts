'use client';

/**
 * a-fiyatlandirma arayüz metinleri (TR/EN). Bileşenler `useAdminFiyatlandirmaCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminFiyatlandirmaText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  matrixCaption: 'Plan özellik matrisi',
  offSale: 'satışa kapalı',
  newRowHint: 'Yeni satır, en az bir plana eklenene kadar yalnız bu ekranda görünür.',
  dealerCard: 'Bayinin göreceği kart',
  offSaleHidden: 'Satışa kapalı — vitrinde görünmez',
  noAudit: 'Bu plan için denetim kaydı bulunmuyor.',
  orderHint: 'Kartlar bayinin ve vitrinin göreceği sırada. Okları kullanarak sıralayın, sonra kaydedin.',
  business: 'İşletme',
  payer: 'Ödeyen',
  created: 'Oluşturma:',
  noStripeKey: 'Stripe anahtarı tanımlı değil. Eşlemeler kaydedilebilir ama doğrulanamaz ve bayiler çevrim içi ödeme yapamaz.',
  notVerified: 'Henüz doğrulanmadı.',
};

export type AdminFiyatlandirmaCopy = Record<keyof typeof tr, string>;

const en: AdminFiyatlandirmaCopy = {
  matrixCaption: 'Plan feature matrix',
  offSale: 'not for sale',
  newRowHint: 'A new row only shows on this screen until it\'s added to at least one plan.',
  dealerCard: 'Card the dealer sees',
  offSaleHidden: 'Not for sale — hidden from the storefront',
  noAudit: 'No audit records for this plan.',
  orderHint: 'Cards are in the order dealers and the storefront see them. Reorder with the arrows, then save.',
  business: 'Business',
  payer: 'Payer',
  created: 'Created:',
  noStripeKey: 'No Stripe key is set. Mappings can be saved but not verified, and dealers can\'t pay online.',
  notVerified: 'Not verified yet.',
};

export function useAdminFiyatlandirmaCopy(): AdminFiyatlandirmaCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminFiyatlandirmaText({ k }: { k: keyof AdminFiyatlandirmaCopy }): string {
  return useAdminFiyatlandirmaCopy()[k];
}
