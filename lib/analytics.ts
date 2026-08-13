/**
 * PostHog event/identify — FAIL-SAFE. NEXT_PUBLIC_POSTHOG_KEY yoksa hiç çalışmaz
 * (posthog-js çekilmez). Client-only; SSR'de sessizce no-op. [[posthog-provider]]
 */

export function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  import('posthog-js')
    .then(({ default: posthog }) => {
      try { posthog.capture(event, props); } catch { /* yut */ }
    })
    .catch(() => { /* yut */ });
}

/** Giriş/kayıt sonrası kullanıcıyı PostHog kimliğine bağlar (funnel'da kişi bazlı). */
export function identify(userId: string, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  import('posthog-js')
    .then(({ default: posthog }) => {
      try { posthog.identify(userId, props); } catch { /* yut */ }
    })
    .catch(() => { /* yut */ });
}
