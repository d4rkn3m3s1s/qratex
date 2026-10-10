'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { PostHog } from 'posthog-js';
import { useConsent } from '@/lib/consent/client';
import { redactUrl } from '@/lib/consent';
import {
  clearPostHogStorage,
  postHogInitConfig,
  redactPostHogEvent,
  syncAnalyticsConsent,
  syncReplay,
  type PostHogDeps,
} from './posthog-consent';

/**
 * PostHog ürün analitiği — RIZAYA BAĞLI (P0-31, KVKK m.5/m.7).
 *
 *  - Rıza yoksa/"reddet" ise posthog-js HİÇ indirilmez ve hiçbir ağ isteği yapılmaz.
 *  - Analitik rızası → `opt_out_capturing_by_default` ile başlatılır, ardından açıkça opt-in.
 *  - Oturum kaydı (replay) AYRI kategori: yalnız `replay` rızası varsa ve yol izinliyse
 *    (`/auth`, `/admin-gate`, `/c/…`, `/experience/…` hariç) başlar; girişler maskelenir.
 *  - `before_send`: URL'lerdeki `token`/`code`/`state`… ve token taşıyan yol parçaları
 *    gizlenir (sıfırlama/magic link token'ı üçüncü tarafa gitmez).
 *  - Rıza geri çekilince: kayıt durur, capture opt-out, kimlik sıfırlanır, `ph_*` çerez ve
 *    yerel depolama anahtarları silinir.
 *  - NEXT_PUBLIC_POSTHOG_KEY yoksa bileşen tamamen etkisizdir (FAIL-SAFE).
 *  Karar mantığı saf modülde: `./posthog-consent.ts` (testli).
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

let instance: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;

/** Yalnız analitik rızası varken çağrılır: kütüphaneyi indirir ve (bir kez) başlatır. */
function loadPostHog(): Promise<PostHog | null> {
  if (!KEY || typeof window === 'undefined') return Promise.resolve(null);
  if (instance) return Promise.resolve(instance);
  loading ??= import('posthog-js')
    .then(({ default: posthog }) => {
      if (!(posthog as unknown as { __loaded?: boolean }).__loaded) {
        posthog.init(KEY, {
          ...postHogInitConfig(HOST),
          before_send: (event) => redactPostHogEvent(event),
        });
      }
      instance = posthog;
      return posthog;
    })
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}

const deps: PostHogDeps<PostHog> = {
  enabled: Boolean(KEY),
  current: () => instance,
  load: loadPostHog,
  clearStorage: clearPostHogStorage,
};

/** Şu an analitik gönderilebilir mi? (rıza + opt-in) */
export function isAnalyticsActive(): boolean {
  try {
    return instance !== null && instance.has_opted_in_capturing();
  } catch {
    return false;
  }
}

function PageviewTracker({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!enabled || !KEY) return;
    const qs = searchParams?.toString();
    const url = `${window.location.origin}${pathname}${qs ? `?${qs}` : ''}`;
    void loadPostHog().then((ph) => {
      if (!ph || !ph.has_opted_in_capturing()) return;
      ph.capture('$pageview', { $current_url: redactUrl(url) });
    });
  }, [enabled, pathname, searchParams]);

  return null;
}

export function PostHogProvider() {
  const consent = useConsent();
  const pathname = usePathname();
  const analytics = consent.ready && consent.categories.analytics;
  const replay = analytics && consent.categories.replay;

  // Analitik rızası ↔ opt-in / opt-out (+ eski dönemden kalan ph_* izlerinin temizliği).
  useEffect(() => {
    void syncAnalyticsConsent({ ready: consent.ready, analytics, replay }, deps);
  }, [analytics, replay, consent.ready]);

  // Oturum kaydı: ayrı rıza + izinli yol.
  useEffect(() => {
    void syncReplay({ ready: consent.ready, analytics, replay }, pathname, deps);
  }, [analytics, replay, consent.ready, pathname]);

  if (!KEY) return null;

  // Suspense: useSearchParams SSR bailout guard.
  return (
    <Suspense fallback={null}>
      <PageviewTracker enabled={analytics} />
    </Suspense>
  );
}
