/**
 * PostHog event/identify — FAIL-SAFE ve RIZAYA BAĞLI (P0-31). NEXT_PUBLIC_POSTHOG_KEY yoksa
 * ya da kullanıcı analitik çerezlerine onay vermediyse hiç çalışmaz (posthog-js çekilmez,
 * ağ isteği olmaz). Client-only; SSR'de sessizce no-op. [[posthog-provider]]
 */
import { getConsentSnapshot } from '@/lib/consent/client';

function analyticsAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return false;
  try {
    return getConsentSnapshot().categories.analytics === true;
  } catch {
    return false;
  }
}

type PostHogLike = { __loaded?: boolean; has_opted_in_capturing?: () => boolean };

/** PostHog sağlayıcı tarafından rızayla başlatılmış ve opt-in olmuş mu? */
function ready(posthog: PostHogLike): boolean {
  try {
    return posthog.__loaded === true && posthog.has_opted_in_capturing?.() === true;
  } catch {
    return false;
  }
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (!analyticsAllowed()) return;
  import('posthog-js')
    .then(({ default: posthog }) => {
      if (!ready(posthog as unknown as PostHogLike)) return;
      try { posthog.capture(event, props); } catch { /* yut */ }
    })
    .catch(() => { /* yut */ });
}

/** Giriş/kayıt sonrası kullanıcıyı PostHog kimliğine bağlar (funnel'da kişi bazlı). */
export function identify(userId: string, props?: Record<string, unknown>): void {
  if (!analyticsAllowed()) return;
  import('posthog-js')
    .then(({ default: posthog }) => {
      if (!ready(posthog as unknown as PostHogLike)) return;
      try { posthog.identify(userId, props); } catch { /* yut */ }
    })
    .catch(() => { /* yut */ });
}
