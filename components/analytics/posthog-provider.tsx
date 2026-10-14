'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

/**
 * PostHog ürün-analitiği: FAIL-SAFE. NEXT_PUBLIC_POSTHOG_KEY yoksa HİÇ yüklenmez
 * (bundle'a girmez, ağ isteği olmaz → hız/tasarım etkilenmez). Key varsa funnel /
 * session-replay / heatmap toplar. Redis mantığıyla aynı: opsiyonel katman.
 */
const REPLAY = process.env.NEXT_PUBLIC_POSTHOG_REPLAY === '1';

/** İlk boyamayı bloklamamak için: sayfa yüklendikten sonra boşta çalıştır. */
function whenIdle(cb: () => void) {
  const run = () => {
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (ric) ric(cb, { timeout: 4000 });
    else setTimeout(cb, 1500);
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

let initPromise: Promise<unknown> | null = null;

function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === 'undefined') return null;
  // Dinamik import: key yoksa posthog-js hiç çekilmez.
  if (initPromise) return initPromise;
  initPromise = import('posthog-js').then(({ default: posthog }) => {
    if (!(posthog as unknown as { __loaded?: boolean }).__loaded) {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
        person_profiles: 'identified_only', // anonim ziyaretçiyi profil sayma (kotayı korur)
        capture_pageview: false, // SPA route değişimini kendimiz gönderiyoruz (aşağıda)
        capture_pageleave: true,
        autocapture: true, // tıklama/heatmap
        // Ağır uzak eklentiler (recorder ~67 KB, surveys ~33 KB, dead-clicks,
        // web-vitals) varsayılan KAPALI → ilk yük hafif. Web vitals zaten Vercel
        // Speed Insights'ta. Geri açmak için: NEXT_PUBLIC_POSTHOG_REPLAY=1.
        disable_session_recording: !REPLAY,
        disable_surveys: !REPLAY,
        capture_dead_clicks: REPLAY,
        capture_performance: REPLAY ? undefined : false,
      });
    }
    return posthog;
  });
  return initPromise;
}

let ready: Promise<void> | null = null;
/** Init boşta tetiklenir; pageview'lar init bitene kadar bekler (kaybolmaz). */
function whenReady(): Promise<void> {
  if (!ready) ready = new Promise<void>((res) => whenIdle(() => void initPostHog()?.then(() => res())));
  return ready;
}

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    let url = pathname;
    const qs = searchParams?.toString();
    if (qs) url = `${url}?${qs}`;
    const href = window.location.origin + url;
    void whenReady().then(() => import('posthog-js')).then(({ default: posthog }) => {
      posthog.capture('$pageview', { $current_url: href });
    });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) void whenReady();
  }, []);

  // Suspense: useSearchParams SSR bailout guard.
  return (
    <Suspense fallback={null}>
      <PageviewTracker />
    </Suspense>
  );
}
