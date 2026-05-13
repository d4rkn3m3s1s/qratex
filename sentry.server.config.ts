/**
 * Server-side Sentry init (P2-25).
 * Loads `@sentry/nextjs` only when a DSN is set so optional tracing does not pull the full SDK into every serverless graph.
 */
export async function initSentryServer(): Promise<void> {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    environment: process.env.NODE_ENV,
    enabled: true,
    beforeSend(event, hint) {
      if (event.user) {
        event.user.email = undefined;
        event.user.ip_address = undefined;
      }
      return event;
    },
  });
}
