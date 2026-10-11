'use client';

/**
 * a-gorevler arayüz metinleri (TR/EN). Bileşenler `useAdminGorevlerCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminGorevlerText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  archiveQ: 'Görev arşivlensin mi?',
  reason: 'Gerekçe',
  markComplete: 'Kullanıcı için tamamlandı işaretle',
  userLookup: 'Müşteri e-postası ya da kullanıcı kimliği',
  definition: 'Tanım',
  progressNote: 'Canlı sayılan görevlerde ilerleme kaydı ilk ödül alımında açılır; ilerleyip henüz almamış kullanıcılar burada görünmez.',
  payouts14d: 'Son 14 gün ödeme',
  noCompletions: 'Henüz tamamlayan yok.',
  changeHistory: 'Değişiklik geçmişi',
  noRecords: 'Kayıt yok.',
  step1: '1 · Ne yapılınca ilerler?',
  step3: '3 · Ödül',
  step4: '4 · Müşterinin göreceği',
  noExpiry: 'Süresiz',
  actions: 'İşlemler',
  moduleOff: 'Görevler modülü şu an müşterilere kapalı: görevleri yönetebilirsiniz ama müşteriler göremez ve ödül alamaz.',
  fromTemplate: 'Şablondan görev',
  templateHint: 'Hepsi motoru olan mekaniklerdir; ödül Puan Matrisi varsayılanından türetilir. Seçtiğiniz şablon düzenleyicide açılır, kaydetmeden yayına çıkmaz.',
};

export type AdminGorevlerCopy = Record<keyof typeof tr, string>;

const en: AdminGorevlerCopy = {
  archiveQ: 'Archive this quest?',
  reason: 'Reason',
  markComplete: 'Mark as completed for a user',
  userLookup: 'Customer email or user ID',
  definition: 'Definition',
  progressNote: 'For live-counted quests, a progress record is created at the first reward claim; users who progressed but haven\'t claimed yet don\'t show up here.',
  payouts14d: 'Payouts, last 14 days',
  noCompletions: 'Nobody has completed it yet.',
  changeHistory: 'Change history',
  noRecords: 'No records.',
  step1: '1 · What makes it progress?',
  step3: '3 · Reward',
  step4: '4 · What the customer sees',
  noExpiry: 'No end date',
  actions: 'Actions',
  moduleOff: 'The quests module is off for customers: you can manage quests, but customers can\'t see them or earn rewards.',
  fromTemplate: 'Quest from a template',
  templateHint: 'Each one is a mechanic the engine already supports; the reward comes from the Points Matrix default. The template opens in the editor and won\'t go live until you save.',
};

export function useAdminGorevlerCopy(): AdminGorevlerCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminGorevlerText({ k }: { k: keyof AdminGorevlerCopy }): string {
  return useAdminGorevlerCopy()[k];
}
