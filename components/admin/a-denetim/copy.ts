'use client';

/**
 * a-denetim arayüz metinleri (TR/EN). Bileşenler `useAdminDenetimCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminDenetimText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  period: 'Dönem',
  allTime: 'Tüm zamanlar',
  all: 'Tümü',
  severity: 'Önem',
  entity: 'Varlık',
  allEntities: 'Tüm varlıklar',
  allActions: 'Tüm eylemler',
  actor: 'Aktör',
  selectedUser: 'Seçili kullanıcı',
  actorRole: 'Aktör rolü',
  allRoles: 'Tüm roller',
  actorType: 'Aktör türü',
  start: 'Başlangıç',
  end: 'Bitiş',
  newestFirst: 'En yeni önce',
  oldestFirst: 'En eski önce',
  noDiff: 'Önceki ve sonraki değer arasında alan farkı yok.',
  diffCapped: 'Fark ilk 400 alanla sınırlandı; tamamı için Ham JSON görünümüne geçin.',
  diffCaption: 'Alan bazlı önce/sonra farkı',
  oldValue: 'Önceki değer:',
  newValue: 'Yeni değer:',
};

export type AdminDenetimCopy = Record<keyof typeof tr, string>;

const en: AdminDenetimCopy = {
  period: 'Period',
  allTime: 'All time',
  all: 'All',
  severity: 'Severity',
  entity: 'Entity',
  allEntities: 'All entities',
  allActions: 'All actions',
  actor: 'Actor',
  selectedUser: 'Selected user',
  actorRole: 'Actor role',
  allRoles: 'All roles',
  actorType: 'Actor type',
  start: 'From',
  end: 'To',
  newestFirst: 'Newest first',
  oldestFirst: 'Oldest first',
  noDiff: 'No field differences between the before and after values.',
  diffCapped: 'The diff is capped at the first 400 fields; switch to Raw JSON to see everything.',
  diffCaption: 'Field-by-field before/after diff',
  oldValue: 'Old value:',
  newValue: 'New value:',
};

export function useAdminDenetimCopy(): AdminDenetimCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminDenetimText({ k }: { k: keyof AdminDenetimCopy }): string {
  return useAdminDenetimCopy()[k];
}
