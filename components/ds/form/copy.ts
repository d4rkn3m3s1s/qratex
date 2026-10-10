'use client';

import { useDsLocale, type DsLocale } from '../a11y/copy';

/** Form bileşenlerinin varsayılan metinleri (TR/EN). Her metin prop ile ezilebilir. */
const COPY = {
  tr: {
    required: 'zorunlu',
    optional: 'isteğe bağlı',
    save: 'Kaydet',
    saving: 'Kaydediliyor…',
    create: 'Oluştur',
    cancel: 'Vazgeç',
    discard: 'Geri al',
    unsaved: 'Kaydedilmemiş değişiklikler var',
    unsavedRegion: 'Kaydedilmemiş değişiklikler',
    unsavedAnnounce: 'Kaydedilmemiş değişiklikler var. Kaydetmek için Ctrl+S.',
    saved: 'Değişiklikler kaydedildi',
    saveFailed: 'Kaydedilemedi',
    conflictTitle: 'Bu kayıt siz düzenlerken değişti',
    conflictBody:
      'Başka biri (ya da başka bir sekme) bu kaydı sizden sonra güncelledi. Kaydederseniz onun değişiklikleri kaybolabilir. Güncel hali yükleyip değişikliklerinizi yeniden uygulayın.',
    reloadLatest: 'Güncel hali yükle',
    overwrite: 'Yine de kaydet',
    leaveTitle: 'Kaydedilmemiş değişiklikler kaybolacak',
    leaveBody: 'Kapatırsanız bu formdaki değişiklikler kaydedilmez.',
    keepEditing: 'Düzenlemeye dön',
    discardAndClose: 'Değişiklikleri at ve kapat',
    createTitle: (entity?: string) => (entity ? `Yeni ${entity}` : 'Yeni kayıt'),
    editTitle: (entity?: string) => (entity ? `${capitalizeTr(entity)} düzenle` : 'Kaydı düzenle'),
    createdToast: (entity?: string) => (entity ? `${capitalizeTr(entity)} oluşturuldu` : 'Kayıt oluşturuldu'),
    updatedToast: (entity?: string) => (entity ? `${capitalizeTr(entity)} güncellendi` : 'Kayıt güncellendi'),
    invalidNumber: 'Geçerli bir sayı girin.',
    integerOnly: 'Tam sayı girin.',
    invalidMoney: 'Geçerli bir tutar girin (en fazla 2 ondalık).',
    negativeNotAllowed: 'Negatif değer girilemez.',
    minValue: (v: string) => `En az ${v} olmalı.`,
    maxValue: (v: string) => `En fazla ${v} olabilir.`,
    increment: 'Artır',
    decrement: 'Azalt',
    charCount: (n: number, max: number) => `${n} / ${max} karakter`,
    charsLeftAnnounce: (n: number) => `${n} karakter kaldı`,
    charLimitAnnounce: 'Karakter sınırına ulaşıldı',
    charOverAnnounce: (n: number) => `Sınır ${n} karakter aşıldı`,
    from: 'Başlangıç',
    to: 'Bitiş',
    rangeOrder: 'Bitiş tarihi başlangıçtan önce olamaz.',
    presetLast7: 'Son 7 gün',
    presetLast30: 'Son 30 gün',
    presetThisMonth: 'Bu ay',
    presetLastMonth: 'Geçen ay',
    presetsLabel: 'Hızlı aralık',
    selectPlaceholder: 'Seçin',
  },
  en: {
    required: 'required',
    optional: 'optional',
    save: 'Save',
    saving: 'Saving…',
    create: 'Create',
    cancel: 'Cancel',
    discard: 'Discard',
    unsaved: 'You have unsaved changes',
    unsavedRegion: 'Unsaved changes',
    unsavedAnnounce: 'You have unsaved changes. Press Ctrl+S to save.',
    saved: 'Changes saved',
    saveFailed: 'Could not save',
    conflictTitle: 'This record changed while you were editing',
    conflictBody:
      'Someone else (or another tab) updated this record after you opened it. Saving now could overwrite their changes. Load the latest version and re-apply your edits.',
    reloadLatest: 'Load latest',
    overwrite: 'Save anyway',
    leaveTitle: 'Unsaved changes will be lost',
    leaveBody: 'If you close now, the changes in this form will not be saved.',
    keepEditing: 'Keep editing',
    discardAndClose: 'Discard and close',
    createTitle: (entity?: string) => (entity ? `New ${entity}` : 'New record'),
    editTitle: (entity?: string) => (entity ? `Edit ${entity}` : 'Edit record'),
    createdToast: (entity?: string) => (entity ? `${capitalizeEn(entity)} created` : 'Record created'),
    updatedToast: (entity?: string) => (entity ? `${capitalizeEn(entity)} updated` : 'Record updated'),
    invalidNumber: 'Enter a valid number.',
    integerOnly: 'Enter a whole number.',
    invalidMoney: 'Enter a valid amount (max 2 decimals).',
    negativeNotAllowed: 'Negative values are not allowed.',
    minValue: (v: string) => `Must be at least ${v}.`,
    maxValue: (v: string) => `Must be at most ${v}.`,
    increment: 'Increase',
    decrement: 'Decrease',
    charCount: (n: number, max: number) => `${n} / ${max} characters`,
    charsLeftAnnounce: (n: number) => `${n} characters left`,
    charLimitAnnounce: 'Character limit reached',
    charOverAnnounce: (n: number) => `Over the ${n} character limit`,
    from: 'Start',
    to: 'End',
    rangeOrder: 'End date cannot be before the start date.',
    presetLast7: 'Last 7 days',
    presetLast30: 'Last 30 days',
    presetThisMonth: 'This month',
    presetLastMonth: 'Last month',
    presetsLabel: 'Quick range',
    selectPlaceholder: 'Select',
  },
} as const;

function capitalizeTr(s: string): string {
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
}
function capitalizeEn(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type FormCopy = (typeof COPY)['tr'];

export function useFormCopy(): FormCopy {
  return COPY[useDsLocale()] as FormCopy;
}

export function getFormCopy(locale: DsLocale = 'tr'): FormCopy {
  return COPY[locale] as FormCopy;
}
