/**
 * Sentry server-side config (P2-25).
 * Set SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN in env to enable; no-op when unset.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  environment: process.env.NODE_ENV,
  enabled: !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
  beforeSend(event, hint) {
    if (event.user) {
      event.user.email = undefined;
      event.user.ip_address = undefined;
    }
    return event;
  },
});
