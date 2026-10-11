'use client';

/**
 * a-kampanya-takvimi arayüz metinleri (TR/EN). Bileşenler `useAdminKampanyaTakvimiCopy()` ile nesneyi,
 * ya da kanca kullanılamayan yerlerde (tablo hücresi, koşullu dal) `<AdminKampanyaTakvimiText k="…" />` ile tek metni alır.
 */
import { useDsLocale } from '@/components/ds/a11y/copy';

const tr = {
  noLive: 'Herkese açık canlı kampanya yok; kazanımlar taban puanla işliyor.',
  defaultTheme: 'Varsayılan tema ve arka plan etkin.',
  windowIst: 'Pencere (İstanbul)',
  noOverlap: 'Bu kayıtla çakışan etkin kayıt yok.',
  noChanges: 'Kayıtlı değişiklik yok.',
  badConditions: 'Kayıtlı koşullar tanınmıyor; seçici bu kampanyayı hiç uygulamıyor. Düzenleyip kaydedin.',
  badQuest: 'Kayıtlı görev geçersiz; müşteride görünmüyor. Düzenleyip kaydedin.',
  fixToCalc: 'Formdaki hatalar giderilince çakışma ve etki burada hesaplanır.',
  baseline: 'Taban (son 7 gün, günlük)',
  extraPerDay: 'Tahmini ek puan / gün',
  budgetRunway: 'Bütçe tahmini dolma süresi',
  dealsCard: 'Müşterinin Fırsatlar sekmesinde göreceği kart (önizleme)',
  audienceOnly: 'Bu kart yalnız hedef kitledeki müşterilere görünür.',
  bannerPreview: 'Kullanıcıların göreceği üst banner ve palet (önizleme)',
  paletteUnchanged: 'Palet değişmez',
  appliesTo: 'Uygulandığı yollar: geri bildirim ödülü ve tüketim pasif puanı. İkisi de günlük tavana tabidir.',
  oneAtATime: 'Aynı anda tek kampanya uygulanır: çarpanı büyük olan kazanır, eşitse bonusu büyük olan. Zincir tavanı 4×.',
  bonusWarn: 'Bonus her kazanıma eklenir; yüksek bonus günlük tavanı hızla doldurabilir.',
  badgeMissing: 'Seçili rozet (pasif/bulunamadı)',
  templateFills: 'Şablon ad, banner, palet ve arka planı doldurur; tarihleri korur.',
  unarchiveFirst: 'Arşivdeki kayıt etkinleştirilemez; önce arşivden çıkarın.',
};

export type AdminKampanyaTakvimiCopy = Record<keyof typeof tr, string>;

const en: AdminKampanyaTakvimiCopy = {
  noLive: 'No public campaign is live; earnings use base points.',
  defaultTheme: 'The default theme and background are active.',
  windowIst: 'Window (Istanbul)',
  noOverlap: 'No active entries overlap with this one.',
  noChanges: 'No saved changes.',
  badConditions: 'The saved conditions aren\'t recognized, so this campaign never applies. Edit and save it.',
  badQuest: 'The saved quest is invalid and hidden from customers. Edit and save it.',
  fixToCalc: 'Once the form errors are fixed, overlap and impact are calculated here.',
  baseline: 'Baseline (last 7 days, daily)',
  extraPerDay: 'Estimated extra points / day',
  budgetRunway: 'Estimated time until budget runs out',
  dealsCard: 'Card customers see in the Deals tab (preview)',
  audienceOnly: 'Only customers in the target audience see this card.',
  bannerPreview: 'Top banner and palette users will see (preview)',
  paletteUnchanged: 'Palette unchanged',
  appliesTo: 'Applies to: the feedback reward and passive points from purchases. Both are subject to the daily cap.',
  oneAtATime: 'Only one campaign applies at a time: the higher multiplier wins, and on a tie the bigger bonus. The chain cap is 4×.',
  bonusWarn: 'The bonus is added to every earning; a high bonus can fill the daily cap quickly.',
  badgeMissing: 'Selected badge (inactive/not found)',
  templateFills: 'The template fills in the name, banner, palette and background; your dates stay as they are.',
  unarchiveFirst: 'Archived entries can\'t be activated; unarchive it first.',
};

export function useAdminKampanyaTakvimiCopy(): AdminKampanyaTakvimiCopy {
  return useDsLocale() === 'en' ? en : tr;
}

/** Tek bir metni etkin dilde basar. */
export function AdminKampanyaTakvimiText({ k }: { k: keyof AdminKampanyaTakvimiCopy }): string {
  return useAdminKampanyaTakvimiCopy()[k];
}
