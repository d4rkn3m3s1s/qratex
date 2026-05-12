/**
 * Next.js instrumentation hook (P2-25).
 * Registers Sentry server config. Edge branch is no-op so Next emits edge-instrumentation.js (avoids ENOENT).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    // No-op: edge route yok; Sentry edge kapatıldı. Dal boş bırakıldı ki Next edge-instrumentation.js üretsin.
  }
}
