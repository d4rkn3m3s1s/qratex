'use client';

import { useEffect } from 'react';
import type { Metric } from 'web-vitals';

function postVital(metric: Metric) {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const payload = JSON.stringify({
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
    path,
  });
  void fetch('/api/user/web-vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

/**
 * Authenticated dashboard panellerinde örnek toplama (kullanıcı id + rol sunucuda).
 * Admin, bayi, müşteri ve staff layout’larında monte edilir.
 */
export function WebVitalsReporter() {
  useEffect(() => {
    let cancelled = false;
    void import('web-vitals').then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
      if (cancelled) return;
      onLCP(postVital);
      onINP(postVital);
      onCLS(postVital);
      onFCP(postVital);
      onTTFB(postVital);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
