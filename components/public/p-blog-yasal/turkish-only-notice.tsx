'use client';

import { Languages } from 'lucide-react';
import { useAppLocale } from '@/lib/app-locale';

/**
 * Arayüz İngilizce seçiliyken metnin yalnız Türkçe olduğunu (ve bağlayıcı olanın Türkçe metin
 * olduğunu) açıkça söyler. Sayfa statik kalır; yalnız bu küçük ada dil tercihini okur.
 */
export function TurkishOnlyNotice({ kind }: { kind: 'legal' | 'article' | 'blog' }) {
  const { locale } = useAppLocale();
  if (locale !== 'en') return null;
  return (
    <p
      lang="en"
      className="flex items-start gap-2 rounded-control border border-info-border bg-info-subtle px-3 py-2 text-sm text-info print:hidden"
    >
      <Languages className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {kind === 'legal'
        ? 'This document is available in Turkish only. The Turkish text is the binding version.'
        : kind === 'blog'
          ? 'Our blog is published in Turkish only.'
          : 'This article is available in Turkish only.'}
    </p>
  );
}
