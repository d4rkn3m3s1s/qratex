'use client';

/**
 * a-komuta arayüz metinleri (TR/EN). Bileşenler `useAdminKomutaCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminKomutaText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  actorType: 'Aktör türü:',
  pulseData: 'Platform nabzı kova verisi',
  records: 'kayıt',
};

export type AdminKomutaCopy = Record<keyof typeof tr, string>;

const en: AdminKomutaCopy = {
  actorType: 'Actor type:',
  pulseData: 'Platform pulse bucket data',
  records: 'records',
};

export function useAdminKomutaCopy(): AdminKomutaCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminKomutaText({ k }: { k: keyof AdminKomutaCopy }): string {
  return useAdminKomutaCopy()[k];
}
