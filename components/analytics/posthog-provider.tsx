'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { PostHog } from 'posthog-js';
import { useConsent } from '@/lib/consent/client';
import { isReplayAllowedPath, redactAnalyticsEvent, redactUrl } from '@/lib/consent';

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
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

let instance: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;

type CaptureLike = Parameters<typeof redactAnalyticsEvent>[0] & { $set_once?: Record<string, unknown> | null };

/** PostHog `before_send`: URL ve gizli görünen özellikleri ayıklar ($set_once dahil). */
export function redactPostHogEvent<T extends CaptureLike>(event: T | null): T | null {
  const redacted = redactAnalyticsEvent(event);
  if (!redacted) return redacted;
  if (redacted.$set_once) {
    const once = redactAnalyticsEvent({ properties: redacted.$set_once });
    return { ...redacted, $set_once: once?.properties ?? redacted.$set_once };
  }
  return redacted;
}

/** Yalnız analitik rızası varken çağrılır: kütüphaneyi indirir ve (bir kez) başlatır. */
function loadPostHog(): Promise<PostHog | null> {
  if (!KEY || typeof window === 'undefined') return Promise.resolve(null);
  if (instance) return Promise.resolve(instance);
  loading ??= import('posthog-js')
    .then(({ default: posthog }) => {
      if (!(posthog as unknown as { __loaded?: boolean }).__loaded) {
        posthog.init(KEY, {
          api_host: HOST,
          person_profiles: 'identified_only', // anonim ziyaretçiyi profil sayma
          capture_pageview: false, // SPA route değişimini kendimiz (redakte ederek) gönderiyoruz
          capture_pageleave: true,
          autocapture: true,
          // Rıza ayrıca doğrulanana kadar hiçbir şey gönderme.
          opt_out_capturing_by_default: true,
          // Replay ayrı kategori: yalnız açıkça başlatılır.
          disable_session_recording: true,
          session_recording: {
            maskAllInputs: true,
            maskTextSelector: '[data-ph-mask], [data-private]',
            blockSelector: '[data-ph-block]',
          },
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

/** PostHog'un tarayıcıda bıraktığı çerez ve depolama anahtarlarını siler. */
export function clearPostHogStorage(): void {
  if (typeof document === 'undefined') return;
  try {
    for (const part of document.cookie.split(';')) {
      const name = part.split('=')[0]?.trim();
      if (!name || !/^(ph_|__ph_)/.test(name)) continue;
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
      const host = location.hostname;
      const root = host.split('.').slice(-2).join('.');
      document.cookie = `${name}=; Path=/; Domain=.${root}; Max-Age=0; SameSite=Lax`;
    }
  } catch {
    /* yut */
  }
  for (const store of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const s = store();
      const keys: string[] = [];
      for (let i = 0; i < s.length; i += 1) {
        const k = s.key(i);
        if (k && /^(ph_|__ph_)/.test(k)) keys.push(k);
      }
      keys.forEach((k) => s.removeItem(k));
    } catch {
      /* depolama kapalı */
    }
  }
}

/** Rıza geri çekildiğinde: kaydı durdur, opt-out, kimliği sıfırla, izleri sil. */
function withdraw(): void {
  const ph = instance;
  if (ph) {
    try {
      ph.stopSessionRecording();
    } catch {
      /* yut */
    }
    try {
      ph.reset();
      ph.opt_out_capturing();
      ph.set_config({ disable_persistence: true });
    } catch {
      /* yut */
    }
  }
  clearPostHogStorage();
}

/** Şu an analitik gönderilebilir mi? (lib/analytics `track`/`identify` için) */
export function isAnalyticsActive(): boolean {
  return instance !== null && instance.has_opted_in_capturing();
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

  // Analitik rızası ↔ opt-in / opt-out
  useEffect(() => {
    if (!KEY || !consent.ready) return;
    if (!analytics) {
      if (instance) withdraw();
      return;
    }
    let cancelled = false;
    void loadPostHog().then((ph) => {
      if (!ph || cancelled) return;
      try {
        ph.set_config({ disable_persistence: false });
        if (!ph.has_opted_in_capturing()) ph.opt_in_capturing({ captureEventName: false });
      } catch {
        /* yut */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [analytics, consent.ready]);

  // Oturum kaydı: ayrı rıza + izinli yol
  useEffect(() => {
    if (!KEY) return;
    const allowed = replay && isReplayAllowedPath(pathname);
    if (!allowed) {
      if (instance) {
        try {
          instance.stopSessionRecording();
        } catch {
          /* yut */
        }
      }
      return;
    }
    void loadPostHog().then((ph) => {
      if (!ph || !ph.has_opted_in_capturing()) return;
      try {
        if (!ph.sessionRecordingStarted()) ph.startSessionRecording();
      } catch {
        /* yut */
      }
    });
  }, [replay, pathname]);

  if (!KEY) return null;

  // Suspense: useSearchParams SSR bailout guard.
  return (
    <Suspense fallback={null}>
      <PageviewTracker enabled={analytics} />
    </Suspense>
  );
}
