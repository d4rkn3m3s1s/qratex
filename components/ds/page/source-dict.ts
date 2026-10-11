'use client';

import { useCallback } from 'react';
import { useDsLocale } from '../a11y/copy';
import type { FilterField } from './filter-logic';

/**
 * Kaynak-metin sözlüğü: TR metni anahtar, EN karşılığı değer. Modül düzeyinde tanımlı ve
 * hook kullanamayan sabitler (filtre alanları, sunucu sözleşmesindeki durum etiketleri) için:
 * TR'de metin aynen döner; EN'de sözlükte varsa çevirisi, yoksa kaynak metin döner.
 */
export type SourceDict = Readonly<Record<string, string>>;

export type SourceT = <T>(s: T) => T;

export function useSourceT(dict: SourceDict): SourceT {
  const en = useDsLocale() === 'en';
  return useCallback(<T,>(s: T): T => (en && typeof s === 'string' ? ((dict[s] ?? s) as T) : s), [en, dict]);
}

/** Filtre alanlarının görünen metinlerini (etiket, yer tutucu, "tümü", seçenekler) çevirir. */
export function localizeFields(fields: readonly FilterField[], t: SourceT): FilterField[] {
  return fields.map((f) => {
    if (f.type === 'search') return { ...f, label: t(f.label), ...(f.placeholder ? { placeholder: t(f.placeholder) } : {}) };
    if (f.type === 'select')
      return {
        ...f,
        label: t(f.label),
        ...(typeof f.allLabel === 'string' ? { allLabel: t(f.allLabel) } : {}),
        options: f.options.map((o) => ({ ...o, label: t(o.label) })),
      };
    return { ...f, label: t(f.label) };
  });
}
