'use client';

import { useAppLocale } from '@/lib/app-locale';

/**
 * Durum bileşenlerinin varsayılan metinleri (TR/EN). Sayfalar özel metin
 * verebilir; vermezse buradaki bağlama uygun varsayılan kullanılır.
 * Paylaşılan i18n kataloğuna dokunmadan iki dilli çalışır.
 */
const COPY = {
  tr: {
    loading: 'Yükleniyor…',
    refreshing: 'Güncelleniyor…',
    retry: 'Tekrar dene',
    retrying: 'Deneniyor…',
    errorTitle: 'Veriler yüklenemedi',
    errorBody: 'Bağlantıda ya da sunucuda geçici bir sorun oluştu. Birazdan tekrar deneyin.',
    offlineTitle: 'İnternet bağlantısı yok',
    offlineBody: 'Bağlantınız geri geldiğinde sayfa kaldığı yerden devam eder.',
    forbiddenTitle: 'Bu alana erişim izniniz yok',
    forbiddenBody: 'Yetkiniz olduğunu düşünüyorsanız hesap yöneticinizle iletişime geçin.',
    moduleDisabledTitle: 'Bu modül hesabınızda kapalı',
    moduleDisabledBody: 'Modülü açmak için yöneticinizden destek isteyin.',
    notFoundTitle: 'Aradığınız kayıt bulunamadı',
    notFoundBody: 'Kayıt silinmiş ya da bağlantı değişmiş olabilir.',
    emptyTitle: 'Henüz kayıt yok',
    emptyBody: 'Yeni kayıtlar oluştukça burada görünecek.',
    noResultsTitle: 'Sonuç bulunamadı',
    noResultsBody: 'Arama ifadesini değiştirin ya da filtreleri temizleyin.',
    staleNotice: 'Son yüklenen veriler gösteriliyor; güncelleme başarısız oldu.',
    errorCode: 'Hata kodu',
    pageErrorTitle: 'Bu sayfa yüklenemedi',
    pageErrorBody: 'Beklenmeyen bir sorun oluştu. Tekrar deneyin ya da panelin ana sayfasına dönün.',
    backToPanel: 'Panel ana sayfasına dön',
    confirm: 'Onayla',
    cancel: 'Vazgeç',
    confirmWorking: 'İşleniyor…',
    impactTitle: 'Bu işlem şunları etkileyecek',
    impactLoading: 'Etki hesaplanıyor…',
    impactError: 'Etki önizlemesi alınamadı. Yine de devam edebilirsiniz.',
    typeToConfirm: (phrase: string) => `Onaylamak için “${phrase}” yazın`,
    irreversible: 'Bu işlem geri alınamaz.',
    actionFailed: 'İşlem tamamlanamadı',
    deltaUp: 'arttı',
    deltaDown: 'azaldı',
    deltaFlat: 'değişmedi',
    vsPrevious: 'önceki döneme göre',
  },
  en: {
    loading: 'Loading…',
    refreshing: 'Refreshing…',
    retry: 'Try again',
    retrying: 'Retrying…',
    errorTitle: 'Could not load data',
    errorBody: 'A temporary connection or server problem occurred. Please try again shortly.',
    offlineTitle: 'You are offline',
    offlineBody: 'The page will continue once your connection is back.',
    forbiddenTitle: 'You don’t have access to this area',
    forbiddenBody: 'If you think you should, contact your account administrator.',
    moduleDisabledTitle: 'This module is disabled for your account',
    moduleDisabledBody: 'Ask your administrator to enable it.',
    notFoundTitle: 'Record not found',
    notFoundBody: 'It may have been deleted or the link may have changed.',
    emptyTitle: 'Nothing here yet',
    emptyBody: 'New records will appear here as they are created.',
    noResultsTitle: 'No results',
    noResultsBody: 'Try a different search or clear the filters.',
    staleNotice: 'Showing the last loaded data; refreshing failed.',
    errorCode: 'Error code',
    pageErrorTitle: 'This page could not be loaded',
    pageErrorBody: 'Something unexpected went wrong. Try again or go back to the panel home.',
    backToPanel: 'Back to panel home',
    confirm: 'Confirm',
    cancel: 'Cancel',
    confirmWorking: 'Working…',
    impactTitle: 'This action will affect',
    impactLoading: 'Calculating impact…',
    impactError: 'Could not load the impact preview. You can still continue.',
    typeToConfirm: (phrase: string) => `Type “${phrase}” to confirm`,
    irreversible: 'This action cannot be undone.',
    actionFailed: 'The action could not be completed',
    deltaUp: 'up',
    deltaDown: 'down',
    deltaFlat: 'unchanged',
    vsPrevious: 'vs previous period',
  },
} as const;

export type StateCopy = (typeof COPY)['tr'];

/** Etkin dile göre durum metinleri (AppLocaleProvider gerekir — kök Providers'ta var). */
export function useStateCopy(): StateCopy {
  const { locale } = useAppLocale();
  return COPY[locale === 'en' ? 'en' : 'tr'] as StateCopy;
}

export function getStateCopy(locale: 'tr' | 'en' = 'tr'): StateCopy {
  return COPY[locale] as StateCopy;
}
