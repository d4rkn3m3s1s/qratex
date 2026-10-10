'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppLocale } from '@/lib/app-locale';
import type { PublicLocale } from './fmt';

/**
 * Sunucuda çevrilen sayfalar için dil eşitleyici (landing.md envanter #14, Bulgu 11).
 * Dil seçici çerezi yazar ama sunucu bileşenlerini yeniden çizmez; istemcideki dil
 * sunucunun bastığı dilden farklıysa sayfa bir kez sunucudan tazelenir. Çerez zaten
 * yeni dili taşıdığı için ikinci turda diller eşleşir (döngü olmaz).
 */
export function LocaleSync({ serverLocale }: { serverLocale: PublicLocale }) {
  const { locale } = useAppLocale();
  const router = useRouter();
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    if (locale === serverLocale) {
      refreshedFor.current = null;
      return;
    }
    if (refreshedFor.current === locale) return;
    refreshedFor.current = locale;
    router.refresh();
  }, [locale, serverLocale, router]);

  return null;
}
