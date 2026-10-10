'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

export type ShallowPatch = Record<string, string | null | undefined>;

/**
 * URL sorgu durumu — sunucu bileşenini YENİDEN ÇALIŞTIRMADAN.
 *
 * `router.replace` her filtre/sekme/detay açılışında RSC isteği atıp katalog sorgularını
 * yeniden koşturuyordu. Next App Router, `window.history.pushState/replaceState` çağrılarını
 * `useSearchParams` ile senkronlar: derin link ve geri tuşu çalışır, sunucuya gidilmez.
 */
export function useShallowQuery() {
  const sp = useSearchParams();
  const get = useCallback((key: string) => sp?.get(key) ?? null, [sp]);
  const set = useCallback((patch: ShallowPatch, mode: 'push' | 'replace' = 'replace') => {
    if (typeof window === 'undefined') return;
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    const href = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    if (href === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    if (mode === 'push') window.history.pushState(null, '', href);
    else window.history.replaceState(null, '', href);
  }, []);
  return { get, set };
}
