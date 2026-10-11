'use client';

/**
 * a-kartlar arayüz metinleri (TR/EN). Bileşenler `useAdminKartlarCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminKartlarText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  notExported: 'Henüz dışa aktarılmadı',
  actions: 'İşlemler',
  qrFailed: 'QR üretilemedi.',
  archivedNote: 'Arşivlenmiş kart terminaldir: üzerinde işlem yapılamaz, geçmişi korunur.',
  recentEvents: 'Son 50 kart olayı ve son 10 tüketim.',
  updating: 'Güncelleniyor',
  unassigned: 'Atanmamış',
  newBatch: 'Yeni üretim partisi',
  batchHint: 'Kartlar “Kullanılmamış” durumunda oluşur; müşteri kartı tarayıp aktive ettiğinde ya da siz atadığınızda aktifleşir.',
  notifyOwner: 'Kart sahibine bildirim gönder',
  assignCard: 'Kartı müşteriye ata',
  searchCustomer: 'Müşteri ara',
  searching: 'Aranıyor…',
  hasActiveCard: 'Aktif kartı var',
};

export type AdminKartlarCopy = Record<keyof typeof tr, string>;

const en: AdminKartlarCopy = {
  notExported: 'Not exported yet',
  actions: 'Actions',
  qrFailed: 'Couldn\'t generate the QR code.',
  archivedNote: 'An archived card is final: no further actions, but its history is kept.',
  recentEvents: 'Last 50 card events and last 10 purchases.',
  updating: 'Updating',
  unassigned: 'Unassigned',
  newBatch: 'New production batch',
  batchHint: 'Cards are created as “Unused” and become active when a customer scans and activates one, or when you assign it.',
  notifyOwner: 'Notify the card owner',
  assignCard: 'Assign card to a customer',
  searchCustomer: 'Search customers',
  searching: 'Searching…',
  hasActiveCard: 'Already has an active card',
};

export function useAdminKartlarCopy(): AdminKartlarCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminKartlarText({ k }: { k: keyof AdminKartlarCopy }): string {
  return useAdminKartlarCopy()[k];
}
