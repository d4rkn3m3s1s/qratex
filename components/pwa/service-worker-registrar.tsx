'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ensureServiceWorkerRegistration, shouldRegisterServiceWorker } from '@/lib/pwa/service-worker';

/**
 * Panel kabuklarına (müşteri / bayi layout) yerleştirilir; SW'yi sayfa yüklendikten ve
 * tarayıcı boşa düştükten SONRA kaydeder (ilk boyamayı ve etkileşimi geciktirmez).
 * QR hunisi bu bileşeni hiç render etmez; ek güvence olarak yol denetimi de yapılır.
 * Yalnız üretimde çalışır (geliştirmede next-pwa kapalı).
 */
export function ServiceWorkerRegistrar() {
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!shouldRegisterServiceWorker(pathname)) return;

    let cancelled = false;
    const register = () => {
      if (cancelled) return;
      ensureServiceWorkerRegistration().catch(() => {
        // Kayıt başarısızlığı uygulamayı etkilemez (çevrimdışı özellik yalnızca devre dışı kalır).
      });
    };

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(register, { timeout: 5000 });
      else timeoutId = setTimeout(register, 2000);
    };

    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
      if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
    // Yalnız ilk yüklemede: kayıt kapsamı `/` olduğundan sonraki gezinmelerde tekrar gerekmez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
