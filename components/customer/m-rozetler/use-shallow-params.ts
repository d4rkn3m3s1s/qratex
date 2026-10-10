'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Sorgu dizgisini SUNUCUYA GİTMEDEN güncelleyen kanca (`window.history.*State` — Next App
 * Router bunları `useSearchParams` ile senkronlar). Sekme, sıralama, filtre ve detay
 * (`?badge=`) değişimi rozet koleksiyonunu sunucuda yeniden yüklemez; derin link ve geri
 * tuşu yine çalışır. (DS `useUrlState` `router.replace` kullanır → dinamik sayfada RSC turu.)
 */
export function useShallowParams() {
  const sp = useSearchParams();

  const get = useCallback((key: string) => sp?.get(key) ?? null, [sp]);

  const set = useCallback((patch: Record<string, string | null>, mode: 'replace' | 'push' = 'replace') => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    if (mode === 'push') window.history.pushState(null, '', next);
    else window.history.replaceState(null, '', next);
  }, []);

  return { get, set };
}
