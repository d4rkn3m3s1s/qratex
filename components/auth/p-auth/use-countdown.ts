'use client';

import { useEffect, useState } from 'react';

/** Saniye geri sayımı; `start(sec)` ile başlar, 0'da durur. Kilit/oran sınırı bandı için. */
export function useCountdown() {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearTimeout(id);
  }, [remaining]);
  return { remaining, start: (sec: number) => setRemaining(Math.max(0, Math.ceil(sec))), reset: () => setRemaining(0) };
}

/** Tarayıcı kökeni (SSR'da null; hidrasyon uyuşmazlığı olmasın diye effect ile dolar). */
export function useOrigin(): string | null {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  return origin;
}
