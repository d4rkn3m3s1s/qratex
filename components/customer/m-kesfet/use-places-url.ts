'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

export type PlacesUrlPatch = Record<string, string | number | boolean | null | undefined>;

/**
 * Keşfet URL durumu (sekme, filtreler, açık mekân). `window.history` API'si Next yönlendiricisiyle
 * senkron olduğundan (`useSearchParams` güncellenir) filtre değişimi SUNUCU bileşenini yeniden
 * çalıştırmaz — `router.replace` her tıklamada sayfanın sunucu verisini baştan hesaplatırdı.
 * Varsayılan değerler URL'ye yazılmaz (kısa, paylaşılabilir link).
 */
export function usePlacesUrl() {
  const sp = useSearchParams();
  const get = useCallback((key: string) => sp?.get(key) ?? null, [sp]);
  const set = useCallback((patch: PlacesUrlPatch, mode: 'replace' | 'push' = 'replace') => {
    if (typeof window === 'undefined') return;
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === '' || value === false) next.delete(key);
      else next.set(key, value === true ? '1' : String(value));
    }
    const qs = next.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    if (url === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    if (mode === 'push') window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  }, []);
  return { get, set };
}
