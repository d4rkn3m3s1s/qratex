'use client';

import { useDsLocale } from '@/components/ds/a11y/copy';

/** Özellik ve deney kontrolü — arayüz metinleri (TR/EN). */
const tr = {
  resultsAfterStart: 'Deney başlatılınca sonuçlar burada görünür.',
  winnerNote: 'Kazanan varyant otomatik yayılmaz; ilgili ekranın varsayılanını ayrıca güncelleyin.',
  variantResults: 'Varyant sonuçları',
  showDaily: 'Günlük tabloyu göster',
  userIdOrEmail: 'Kullanıcı kimliği ya da e-posta',
  experimentKey: 'Deney anahtarı',
  measured: 'Ölçülen: varyantı gören tekil kullanıcıların dönüşüm olayı oranı.',
  variantA: 'A varyantı (kontrol)',
  variantB: 'B varyantı',
  experimentNotFound: 'Deney bulunamadı.',
  noApi: 'Bu anahtarı denetleyen API ucu yok.',
  anonBlocks: 'Oturumsuz engellemeler veritabanına yazılmaz (kötüye kullanım koruması).',
  reason: 'Gerekçe',
  rolloutModule: 'Yeni açılış için modül',
  pickModule: 'Modül seçin…',
  gatedOnly: 'Yalnız kullanıcı başına kapı uygulanan (API ya da sayfa) modüller listelenir.',
  userPercent: 'Kullanıcı yüzdesi',
  endsOptional: 'Bitiş (isteğe bağlı)',
  istanbulTime: 'İstanbul saati.',
  allowlist: 'İzin listesi (kullanıcı kimlikleri)',
  noteOptional: 'Not (isteğe bağlı)',
};

type Copy = typeof tr;

const en: Copy = {
  resultsAfterStart: 'Results show up here once the experiment starts.',
  winnerNote: 'The winning variant isn’t rolled out automatically; update the screen’s default separately.',
  variantResults: 'Variant results',
  showDaily: 'Show daily table',
  userIdOrEmail: 'User ID or email',
  experimentKey: 'Experiment key',
  measured: 'Measured: conversion-event rate among unique users who saw the variant.',
  variantA: 'Variant A (control)',
  variantB: 'Variant B',
  experimentNotFound: 'Experiment not found.',
  noApi: 'No API endpoint checks this switch.',
  anonBlocks: 'Blocks without a session aren’t written to the database (abuse protection).',
  reason: 'Reason',
  rolloutModule: 'Module for the new rollout',
  pickModule: 'Choose a module…',
  gatedOnly: 'Only modules with a per-user gate (API or page) are listed.',
  userPercent: 'User percentage',
  endsOptional: 'Ends (optional)',
  istanbulTime: 'Istanbul time.',
  allowlist: 'Allowlist (user IDs)',
  noteOptional: 'Note (optional)',
};

export const FEATURE_LAB_COPY = { tr, en } as const;

export function useFeatureLabCopy(): Copy {
  return FEATURE_LAB_COPY[useDsLocale()];
}
