'use client';

/**
 * a-kvkk arayüz metinleri (TR/EN). Bileşenler `useAdminKvkkCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminKvkkText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  dailyConsent: 'Günlük rıza kararları',
  current: 'güncel',
  allCategories: 'Tüm kategoriler',
  inventory: 'Kişisel veri envanteri',
  records: 'Kayıt',
  personalFields: 'Kişisel alanlar',
  export: 'Dışa aktarım',
  actionEntity: 'İşlem / varlık',
  user: 'Kullanıcı',
  start: 'Başlangıç',
  end: 'Bitiş',
  accessLogs: '5651 erişim kayıtları',
  operation: 'İşlem',
  browser: 'Tarayıcı',
  severity: 'Önem',
  withBrowser: 'Tarayıcı ile',
  noIpWriters: 'IP\'siz yazan işlemler',
  queueRequest: 'Başvuruyu kuyruğa al',
  requestType: 'Talep türü',
  channel: 'Geldiği kanal',
  applicantEmail: 'Başvuranın e-postası',
  receivedDay: 'Başvurunun alındığı gün',
  requestText: 'Başvuru metni (isteğe bağlı)',
  closedFulfilled: 'Talep yürütme kanıtıyla kapandı.',
  closedRejected: 'Talep gerekçeyle reddedildi.',
  proofRequired: 'Kapanış için gereken kanıt',
  noSteps: 'Henüz kayıtlı adım yok.',
  applicationEmail: 'Başvuru e-postası',
  anonymized: 'Anonimleştirilmiş hesap',
  notLinked: 'Hesaba bağlı değil',
  allTypes: 'Tüm türler',
  jobUnreadable: 'İş durumu okunamadı.',
  autoRetention: 'Otomatik saklama kuralları',
  duration: 'Süre',
  analyticsEvents: 'analitik ve erişim engeli olayları',
  legitInterest: 'Meşru menfaat (m.5/2-f)',
  allAutomatic: 'Politika-yalnız süre yok; bütün süreler otomatik uygulanıyor.',
};

export type AdminKvkkCopy = Record<keyof typeof tr, string>;

const en: AdminKvkkCopy = {
  dailyConsent: 'Daily consent decisions',
  current: 'current',
  allCategories: 'All categories',
  inventory: 'Personal data inventory',
  records: 'Records',
  personalFields: 'Personal fields',
  export: 'Export',
  actionEntity: 'Action / entity',
  user: 'User',
  start: 'From',
  end: 'To',
  accessLogs: 'Law 5651 access logs',
  operation: 'Action',
  browser: 'Browser',
  severity: 'Severity',
  withBrowser: 'With browser',
  noIpWriters: 'Actions logged without an IP',
  queueRequest: 'Add request to the queue',
  requestType: 'Request type',
  channel: 'Received via',
  applicantEmail: 'Applicant\'s email',
  receivedDay: 'Date received',
  requestText: 'Request text (optional)',
  closedFulfilled: 'The request was closed with proof of fulfillment.',
  closedRejected: 'The request was rejected with a reason.',
  proofRequired: 'Proof required to close',
  noSteps: 'No steps recorded yet.',
  applicationEmail: 'Request email',
  anonymized: 'Anonymized account',
  notLinked: 'Not linked to an account',
  allTypes: 'All types',
  jobUnreadable: 'Couldn\'t read job status.',
  autoRetention: 'Automatic retention rules',
  duration: 'Duration',
  analyticsEvents: 'analytics and access-block events',
  legitInterest: 'Legitimate interest (Art. 5/2-f)',
  allAutomatic: 'No policy-only periods; every retention period is enforced automatically.',
};

export function useAdminKvkkCopy(): AdminKvkkCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminKvkkText({ k }: { k: keyof AdminKvkkCopy }): string {
  return useAdminKvkkCopy()[k];
}
