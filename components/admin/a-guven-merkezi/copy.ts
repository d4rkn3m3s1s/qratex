'use client';

/**
 * a-guven-merkezi arayüz metinleri (TR/EN). Bileşenler `useAdminGuvenMerkeziCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminGuvenMerkeziText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  noActions: 'Henüz işlem yapılmadı.',
  rawEvidence: 'Ham kanıt (metadata)',
  shadowNote: 'Gölge yasaklı hesabın yeni puan kazanımları bakiyeye yansımaz (defterde "geçersiz" olarak kalır); kullanıcıya başarı görünür.',
  noLedger: 'Defterde kayıt yok.',
  recentPoints: 'Kullanıcının son puan hareketleri',
  operation: 'İşlem',
  reason: 'Gerekçe',
  outOfRange: 'Bazı değerler izin verilen aralığın dışında.',
  caseSeverity: 'Açılan vakanın önemi',
  in30d: '30 günde',
  open: 'Açık',
  falseAlarm: 'Yanlış alarm',
};

export type AdminGuvenMerkeziCopy = Record<keyof typeof tr, string>;

const en: AdminGuvenMerkeziCopy = {
  noActions: 'No actions taken yet.',
  rawEvidence: 'Raw evidence (metadata)',
  shadowNote: 'New points earned by a shadow-banned account don\'t reach the balance (they stay in the ledger as "void"); the user still sees success.',
  noLedger: 'No ledger entries.',
  recentPoints: 'The user\'s recent points activity',
  operation: 'Operation',
  reason: 'Reason',
  outOfRange: 'Some values are outside the allowed range.',
  caseSeverity: 'Severity of the opened case',
  in30d: 'In 30 days',
  open: 'Open',
  falseAlarm: 'False alarm',
};

export function useAdminGuvenMerkeziCopy(): AdminGuvenMerkeziCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminGuvenMerkeziText({ k }: { k: keyof AdminGuvenMerkeziCopy }): string {
  return useAdminGuvenMerkeziCopy()[k];
}
