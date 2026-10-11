import type { ReactNode } from 'react';
import { getMessages } from '@/i18n/request';
import type { MessageTree } from '@/i18n/core';
import { AppLocaleBoundary } from '@/lib/app-locale';
import { getServerLocale } from '@/lib/server-locale';

/**
 * Sunucu-otoriter dil sınırı (mobil-erisilebilirlik-i18n B2). Zaten dinamik olan segment
 * layout'ları (panel, genel site, giriş, paylaşım, QR hunisi) çocuklarını bununla sarar:
 *  - Dil sunucuda çerezden okunur; istemci bileşenleri SSR'da o dilde basılır (TR→EN sıçraması yok).
 *  - Yalnız EN kullanıcıya EN kataloğu (~17 KB gzip) sunucudan bir kez gider; TR kullanıcıya hiç.
 * Kök layout bilerek çerez okumaz: blog/yasal sayfalar ve /offline statik üretilir.
 */
export async function ServerLocaleBoundary({ children }: { children: ReactNode }) {
  const locale = await getServerLocale();
  const messages = locale === 'en' ? (getMessages('en') as unknown as MessageTree) : undefined;
  return (
    <AppLocaleBoundary locale={locale} messages={messages}>
      {children}
    </AppLocaleBoundary>
  );
}
