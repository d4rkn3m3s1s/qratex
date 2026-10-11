'use client';

/**
 * a-ekonomi-studyosu arayüz metinleri (TR/EN). Bileşenler `useAdminEkonomiStudyosuCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminEkonomiStudyosuText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  simLoading: 'Simülasyon yükleniyor…',
  unsaved: '(kaydedilmemiş değişiklik)',
  noCustomers: 'Henüz sınıflandırılacak müşteri yok.',
  distUnreadable: 'Dağılım okunamadı; kurallar yine düzenlenebilir.',
  startThreshold: 'Başlangıç eşiği',
  firstLeagueZero: 'ilk lig her zaman 0\'dan başlar',
  range: 'Aralık',
  customers: 'Müşteri',
  impactHint: 'Eşikleri değiştirince etki burada görünür.',
  fixToPreview: 'Önizleme için hataları düzeltin.',
  impactLoading: 'Etki hesaplanıyor…',
  impactFailed: 'Etki önizlemesi alınamadı.',
  multipliersCaps: 'Çarpan ve tavanlar',
  referral: 'Davet Programı',
  quests: 'Görevler',
  detailed: 'Detaylı',
  detailedLow: 'Detaylı ödül temel ödülden düşük: uzun yorum yazmak cezalandırılmış olur.',
  multiplierNote: 'VIP ve sezonsal kampanya çarpanı kullanıcıya göre ayrıca uygulanır; günlük tavan dolduysa kredi kısalır.',
  wheelOff: 'Çark kapalı — kimse çeviremez.',
  noMilestones: 'Geçerli kilometre taşı yok.',
  appliesTo: 'Uygulandığı kaynaklar:',
  exemptSources: '· oyun, çark, görev, seri, davet ve iade/emanet yolları çarpandan muaftır.',
  noSettings: 'Henüz kayıtlı ayar yok: varsayılan 1× uygulanıyor. İlk kayıtla oluşturulur.',
  capsCaption: 'Kategori tavanları ve son 7 günde tavana takılan kredi sayısı',
  daily: 'Günlük',
  weekly: 'Haftalık',
  perDealerDay: 'Bayi başına / gün',
  capped7d: 'Tavana takılan (7 gün)',
  dealerRequired: 'bayi atfı zorunlu',
  cappedNote: '"Tavana takılan" = tavan dolu olduğu için 0 puanla deftere yazılan kredi (yalnız tek-kez anahtarlı yollar).',
  noFieldChanges: 'Alan değişikliği yok.',
  historyLoading: 'Geçmiş yükleniyor…',
  noHistory: 'Henüz kayıtlı değişiklik yok. İlk kaydınız burada görünecek.',
  saveWarning: 'Aşağıdaki değişiklikler kaydedildiği anda puan kazanımını etkiler. Kayıt denetim günlüğüne yazılır ve geçmişten geri yüklenebilir.',
  daysNote: 'Günler Europe/Istanbul takvimine göre · kaynak: puan defteri',
  flowLoading: 'Puan akışı yükleniyor…',
  flowBySource: 'Kaynak bazında puan akışı',
  type: 'Tür',
  operation: 'İşlem',
  mintBySource: 'Kaynak bazında gerçekleşen ve tahmini basım',
  actual: 'Gerçekleşen',
};

export type AdminEkonomiStudyosuCopy = Record<keyof typeof tr, string>;

const en: AdminEkonomiStudyosuCopy = {
  simLoading: 'Loading simulation…',
  unsaved: '(unsaved changes)',
  noCustomers: 'No customers to classify yet.',
  distUnreadable: 'Couldn\'t load the distribution; you can still edit the rules.',
  startThreshold: 'Starting threshold',
  firstLeagueZero: 'the first league always starts at 0',
  range: 'Range',
  customers: 'Customers',
  impactHint: 'Change the thresholds to see the impact here.',
  fixToPreview: 'Fix the errors to see a preview.',
  impactLoading: 'Calculating impact…',
  impactFailed: 'Couldn\'t load the impact preview.',
  multipliersCaps: 'Multipliers and caps',
  referral: 'Referral program',
  quests: 'Quests',
  detailed: 'Detailed',
  detailedLow: 'The detailed reward is lower than the base reward, so writing a longer review would be penalized.',
  multiplierNote: 'VIP and seasonal campaign multipliers are applied per user on top; if the daily cap is reached, the credit is trimmed.',
  wheelOff: 'The wheel is off — nobody can spin it.',
  noMilestones: 'No valid milestones.',
  appliesTo: 'Applies to:',
  exemptSources: '· games, the wheel, quests, streaks, referrals and refund/escrow paths are exempt from the multiplier.',
  noSettings: 'No saved settings yet: the default 1× applies. Saving once creates them.',
  capsCaption: 'Category caps and credits that hit the cap in the last 7 days',
  daily: 'Daily',
  weekly: 'Weekly',
  perDealerDay: 'Per dealer / day',
  capped7d: 'Capped (7 days)',
  dealerRequired: 'dealer attribution required',
  cappedNote: '"Capped" = a credit written to the ledger with 0 points because the cap was full (one-time keyed paths only).',
  noFieldChanges: 'No field changes.',
  historyLoading: 'Loading history…',
  noHistory: 'No saved changes yet. Your first save will show up here.',
  saveWarning: 'These changes affect points earning as soon as you save. The save is written to the audit log and can be restored from history.',
  daysNote: 'Days follow the Europe/Istanbul calendar · source: points ledger',
  flowLoading: 'Loading points flow…',
  flowBySource: 'Points flow by source',
  type: 'Type',
  operation: 'Operation',
  mintBySource: 'Actual and projected minting by source',
  actual: 'Actual',
};

export function useAdminEkonomiStudyosuCopy(): AdminEkonomiStudyosuCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminEkonomiStudyosuText({ k }: { k: keyof AdminEkonomiStudyosuCopy }): string {
  return useAdminEkonomiStudyosuCopy()[k];
}
