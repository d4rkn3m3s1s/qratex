'use client';

import { useMemo } from 'react';
import { useAppLocale } from '@/lib/app-locale';
import { getLigCopy, ligNumberFormat, type LigCopy, type LigLocale } from './copy';

/** Uygulama dili; `AppLocaleProvider` yoksa (önizleme, test) `tr`. */
export function useLigLocale(): LigLocale {
  try {
    return useAppLocale().locale === 'en' ? 'en' : 'tr';
  } catch {
    return 'tr';
  }
}

export function useLigCopy(): { copy: LigCopy; locale: LigLocale; fmt: (n: number) => string } {
  const locale = useLigLocale();
  return useMemo(() => ({ copy: getLigCopy(locale), locale, fmt: ligNumberFormat(locale) }), [locale]);
}
