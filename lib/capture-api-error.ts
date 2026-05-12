/**
 * Report API route errors to Sentry (production only).
 * Use in catch blocks of critical API routes.
 */
import * as Sentry from '@sentry/nextjs';

export function captureApiError(
  err: unknown,
  context?: { route?: string; status?: number; [key: string]: unknown }
): void {
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureException(err, { extra: context });
  }
}
