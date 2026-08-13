'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

/**
 * PostHog ürün-analitiği: FAIL-SAFE. NEXT_PUBLIC_POSTHOG_KEY yoksa HİÇ yüklenmez
 * (bundle'a girmez, ağ isteği olmaz → hız/tasarım etkilenmez). Key varsa funnel /
 * session-replay / heatmap toplar. Redis mantığıyla aynı: opsiyonel katman.
 */
function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === 'undefined') return null;
  // Dinamik import: key yoksa posthog-js hiç çekilmez.
  return import('posthog-js').then(({ default: posthog }) => {
    if (!(posthog as unknown as { __loaded?: boolean }).__loaded) {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
        person_profiles: 'identified_only', // anonim ziyaretçiyi profil sayma (kotayı korur)
        capture_pageview: false, // SPA route değişimini kendimiz gönderiyoruz (aşağıda)
        capture_pageleave: true,
        autocapture: true, // tıklama/heatmap
        disable_session_recording: false, // session replay açık
      });
    }
    return posthog;
  });
}

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    let url = pathname;
    const qs = searchParams?.toString();
    if (qs) url = `${url}?${qs}`;
    void import('posthog-js').then(({ default: posthog }) => {
      posthog.capture('$pageview', { $current_url: window.location.origin + url });
    });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider() {
  useEffect(() => {
    void initPostHog();
  }, []);

  // Suspense: useSearchParams SSR bailout guard.
  return (
    <Suspense fallback={null}>
      <PageviewTracker />
    </Suspense>
  );
}
