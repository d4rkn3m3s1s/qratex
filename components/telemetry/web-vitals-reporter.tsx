'use client';

import { useEffect } from 'react';
import type { Metric } from 'web-vitals';

/**
 * Oturumlu panellerde (admin, bayi, müşteri, personel) Web Vitals örnekleri.
 *
 * Örnekler sayfa başına biriktirilir ve sayfa gizlenince/kapanınca TEK istekte gönderilir
 * (`sendBeacon`, yoksa `fetch keepalive`). Kullanıcı kimliği ve derece sunucuda belirlenir;
 * yalnız ad, değer ve yol gönderilir.
 */
type Sample = { name: Metric['name']; value: number; path: string };

const MAX_BATCH = 10;

export function WebVitalsReporter() {
  useEffect(() => {
    let cancelled = false;
    const pending = new Map<string, Sample>();

    const flush = () => {
      if (pending.size === 0) return;
      const samples = [...pending.values()].slice(0, MAX_BATCH);
      pending.clear();
      const payload = JSON.stringify({ samples });
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          const ok = navigator.sendBeacon('/api/user/web-vitals', new Blob([payload], { type: 'application/json' }));
          if (ok) return;
        }
      } catch {
        /* fetch'e düş */
      }
      void fetch('/api/user/web-vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    };

    const collect = (metric: Metric) => {
      // Aynı metriğin son değeri geçerlidir (CLS/INP sayfa boyunca güncellenir).
      pending.set(metric.name, { name: metric.name, value: metric.value, path: window.location.pathname });
    };

    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);

    void import('web-vitals').then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
      if (cancelled) return;
      onLCP(collect);
      onINP(collect);
      onCLS(collect);
      onFCP(collect);
      onTTFB(collect);
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  return null;
}
