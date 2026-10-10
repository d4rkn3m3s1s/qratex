'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Sekme içi filtreleri URL'de tutar (paylaşılabilir, yenilemede korunur) — ama sunucu
 * bileşenini yeniden çalıştırmadan: `history.replaceState` Next yönlendiricisiyle
 * senkronlanır (`useSearchParams` güncellenir), RSC isteği atılmaz. Veri zaten istemci
 * önbelleğinden/ucundan geldiği için sayfanın DB ön yüklemesini her filtrede tekrarlamak israf olurdu.
 * Varsayılan değer URL'ye yazılmaz.
 */
export function useSearchParamState(): {
  get: (key: string) => string | null;
  patch: (values: Record<string, string | null | undefined>) => void;
} {
  const sp = useSearchParams();
  const get = useCallback((key: string) => sp?.get(key) ?? null, [sp]);
  const patch = useCallback((values: Record<string, string | null | undefined>) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(values)) {
      if (v === null || v === undefined || v === '') url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(null, '', next);
  }, []);
  return { get, patch };
}
