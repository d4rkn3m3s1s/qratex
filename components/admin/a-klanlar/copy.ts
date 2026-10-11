'use client';

/**
 * a-klanlar arayüz metinleri (TR/EN). Bileşenler `useAdminKlanlarCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminKlanlarText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  extendBy: 'Ne kadar uzatılsın?',
  loading: 'Yükleniyor…',
  noClans: 'Eşleşen klan yok.',
  planBattle: 'Onur savaşı planla',
  duration: 'Süre',
  start: 'Başlangıç',
  remove: 'Çıkar',
  all: 'Tümü',
  noBattles: 'Bu klan henüz bir savaşa girmedi.',
  clanFilter: 'Klan süzgeci:',
};

export type AdminKlanlarCopy = Record<keyof typeof tr, string>;

const en: AdminKlanlarCopy = {
  extendBy: 'Extend by how long?',
  loading: 'Loading…',
  noClans: 'No matching clans.',
  planBattle: 'Schedule an honor battle',
  duration: 'Duration',
  start: 'Start',
  remove: 'Remove',
  all: 'All',
  noBattles: 'This clan hasn\'t fought a battle yet.',
  clanFilter: 'Clan filter:',
};

export function useAdminKlanlarCopy(): AdminKlanlarCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminKlanlarText({ k }: { k: keyof AdminKlanlarCopy }): string {
  return useAdminKlanlarCopy()[k];
}
