/**
 * Next.js instrumentation hook (P2-25).
 * Sentry server SDK loads only when a DSN is configured (smaller Vercel traces when Sentry is off).
 * Edge branch is no-op so Next emits edge-instrumentation.js (avoids ENOENT).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.DISABLE_SENTRY_INSTRUMENTATION === '1') return;
    const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    const { initSentryServer } = await import('./sentry.server.config');
    await initSentryServer();
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    // No-op: edge route yok; Sentry edge kapatıldı. Dal boş bırakıldı ki Next edge-instrumentation.js üretsin.
  }
}
