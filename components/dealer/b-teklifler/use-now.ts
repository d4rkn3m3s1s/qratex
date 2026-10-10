'use client';

import { useEffect, useState } from 'react';

/**
 * Dakikalık saat — kalan süre metinleri için. Sekme gizliyken durur, görünür olunca hemen
 * tazelenir (ops kaydı: sürekli animasyon değil, yalnız veri güncellemesi).
 */
export function useNow(initial: number, intervalMs = 30_000): number {
  // İlk değer sunucunun ürettiği an: SSR ile hidrasyon metni birebir aynı kalır.
  const [now, setNow] = useState(initial);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id) return;
      setNow(Date.now());
      id = setInterval(() => setNow(Date.now()), intervalMs);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };
    const onVis = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs]);
  return now;
}
