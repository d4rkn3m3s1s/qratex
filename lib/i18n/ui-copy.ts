/**
 * Kabuk ve temel UI primitive metinleri (TR/EN) — mobil-erisilebilirlik-i18n B1.
 *
 * Dialog/Sheet kapat düğmesi, atlama bağlantısı, çevrimdışı şeridi, yükleniyor duyuruları gibi
 * HER sayfada görünen ya da ekran okuyucuya okunan metinler buradan gelir. Paylaşılan katalog
 * (messages/*.json) yerine küçük modül sözlüğü: primitive'ler sağlayıcı dışında da (izole
 * test/önizleme) çalışır ve istemci paketine katalog sokmaz. Sunucu bileşenleri `uiCopy(locale)`,
 * istemci bileşenleri `uiCopy(useLocaleSafe())` kullanır.
 */
import type { Locale } from '@/i18n/core';

const tr = {
  close: 'Kapat',
  closeEscape: 'Kapat (Escape)',
  skipToMain: 'Ana içeriğe atla',
  skipToContent: 'İçeriğe atla',
  loading: 'Yükleniyor…',
  pageLoading: 'Sayfa yükleniyor…',
  offline: 'Çevrimdışısınız — bazı özellikler bağlantı gelene kadar çalışmayabilir.',
  notFoundTitle: 'Sayfa bulunamadı',
  notFoundBody: 'Aradığınız sayfa mevcut değil veya taşınmış olabilir.',
  goHome: 'Ana sayfaya dön',
  signIn: 'Giriş yap',
  networkError: 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.',
  genericError: 'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
} as const;

export type UiCopy = { [K in keyof typeof tr]: string };

const en: UiCopy = {
  close: 'Close',
  closeEscape: 'Close (Escape)',
  skipToMain: 'Skip to main content',
  skipToContent: 'Skip to content',
  loading: 'Loading…',
  pageLoading: 'Loading page…',
  offline: 'You are offline — some features may not work until the connection is back.',
  notFoundTitle: 'Page not found',
  notFoundBody: 'The page you are looking for does not exist or may have moved.',
  goHome: 'Back to home',
  signIn: 'Sign in',
  networkError: 'Could not connect. Check your internet connection and try again.',
  genericError: 'The action could not be completed. Please try again.',
};

const COPY: Record<Locale, UiCopy> = { tr, en };

export function uiCopy(locale: Locale | string | null | undefined): UiCopy {
  return locale === 'en' ? COPY.en : COPY.tr;
}
