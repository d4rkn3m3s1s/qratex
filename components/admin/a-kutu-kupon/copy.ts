'use client';

/**
 * a-kutu-kupon arayüz metinleri (TR/EN). Bileşenler `useAdminKutuKuponCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminKutuKuponText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  customerSees: 'Müşteri böyle görecek',
  emptyBox: 'Kutu boş görünecek: puan, kupon ya da mesaj ekleyin.',
  reducedMotion: 'Hareket azaltma açık: açılış animasyonu oynatılmaz.',
  newBox: 'Yeni sürpriz kutu',
  title: 'Başlık',
  messageOptional: 'Mesaj (isteğe bağlı)',
  pointsPerBox: 'Kutu başına puan',
  couponOptional: 'Kupon (isteğe bağlı)',
  searchCustomer: 'Müşteri ara',
  min2: 'En az 2 karakter yazın. Yalnız müşteri hesapları listelenir.',
  noCustomerMatch: 'Eşleşen müşteri yok.',
  howMany: 'Kaç müşteri?',
  recipient: 'Alıcı',
  totalLiability: 'Toplam puan yükümlülüğü',
  dailyBudget: 'Günlük bütçe',
  recipientsNotified: 'Alıcılar uygulama içi bildirim alır. Açılmamış kutuları kampanya ayrıntısından geri çekebilirsiniz.',
  moduleOff: 'Sürpriz kutu modülü kapalı: yeni gönderim yapılamaz, müşteriler kutularını göremez. Geçmiş kampanyaları inceleyebilirsiniz.',
  legacyBox: 'Kampanya kimliği öncesi tekil kutu',
  recallNote: 'Açılmış kutular ve basılmış puanlar etkilenmez. Geri çekilen kutular müşterinin listesinden kalkar; anlık görüntüsü denetim kaydında saklanır.',
  reason: 'Gerekçe',
  allRecalled: 'Bu kampanyada kutu kalmadı (tümü geri çekilmiş).',
  auditHistory: 'Denetim geçmişi',
  noAuditP019: 'Denetim kaydı yok (P0-19 öncesi gönderim).',
  bulkCodes: 'Toplu kod üret',
  bulkHint: 'Her kod tek kez kullanılabilir. Kodlar üretildikten sonra CSV olarak indirilir.',
  prefix: 'Önek',
  expiry: 'Son kullanım',
  entries14d: 'Son 14 gün kod girişi',
  noEntries14d: 'Son 14 günde kod girişi yok.',
  unused: 'Henüz kimse kullanmadı.',
  changeHistory: 'Değişiklik geçmişi',
  noAudit: 'Denetim kaydı yok.',
  totalLimit: 'Toplam kullanım limiti',
  expiryIst: 'Son kullanım (İstanbul saati)',
  emptyNoExpiry: 'Boş bırakılırsa süresiz.',
  couponHint: 'Kupon, sürpriz kutuyla dağıtılan ve kasada gösterilen kampanya kodudur. Ödeme akışı olmadığı için indirimi işletme uygular.',
  onOpen: 'Müşteri kutuyu açınca',
  noExpiry: 'Süresiz',
  actions: 'İşlemler',
  dailyCounts: 'Son 14 günün günlük kutu sayıları',
  day: 'Gün',
  created: 'Üretilen',
  opened: 'Açılan',
};

export type AdminKutuKuponCopy = Record<keyof typeof tr, string>;

const en: AdminKutuKuponCopy = {
  customerSees: 'What the customer will see',
  emptyBox: 'The box will look empty: add points, a coupon or a message.',
  reducedMotion: 'Reduced motion is on: the opening animation won\'t play.',
  newBox: 'New surprise box',
  title: 'Title',
  messageOptional: 'Message (optional)',
  pointsPerBox: 'Points per box',
  couponOptional: 'Coupon (optional)',
  searchCustomer: 'Search customers',
  min2: 'Type at least 2 characters. Only customer accounts are listed.',
  noCustomerMatch: 'No matching customers.',
  howMany: 'How many customers?',
  recipient: 'Recipients',
  totalLiability: 'Total points liability',
  dailyBudget: 'Daily budget',
  recipientsNotified: 'Recipients get an in-app notification. You can recall unopened boxes from the campaign details.',
  moduleOff: 'The surprise box module is off: nothing new can be sent and customers can\'t see their boxes. You can still review past campaigns.',
  legacyBox: 'Single box from before campaign IDs',
  recallNote: 'Opened boxes and minted points aren\'t affected. Recalled boxes disappear from the customer\'s list; a snapshot is kept in the audit log.',
  reason: 'Reason',
  allRecalled: 'No boxes left in this campaign (all recalled).',
  auditHistory: 'Audit history',
  noAuditP019: 'No audit record (sent before P0-19).',
  bulkCodes: 'Generate codes in bulk',
  bulkHint: 'Each code works once. The codes download as a CSV after they\'re generated.',
  prefix: 'Prefix',
  expiry: 'Expires',
  entries14d: 'Code entries, last 14 days',
  noEntries14d: 'No code entries in the last 14 days.',
  unused: 'Nobody has used it yet.',
  changeHistory: 'Change history',
  noAudit: 'No audit records.',
  totalLimit: 'Total usage limit',
  expiryIst: 'Expires (Istanbul time)',
  emptyNoExpiry: 'Leave empty for no expiry.',
  couponHint: 'A coupon is a campaign code handed out in surprise boxes and shown at the till. There\'s no payment flow, so the business applies the discount.',
  onOpen: 'When the customer opens the box',
  noExpiry: 'No expiry',
  actions: 'Actions',
  dailyCounts: 'Daily box counts for the last 14 days',
  day: 'Day',
  created: 'Created',
  opened: 'Opened',
};

export function useAdminKutuKuponCopy(): AdminKutuKuponCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminKutuKuponText({ k }: { k: keyof AdminKutuKuponCopy }): string {
  return useAdminKutuKuponCopy()[k];
}
