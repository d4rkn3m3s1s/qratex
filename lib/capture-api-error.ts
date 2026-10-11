/**
 * Report API route errors to Sentry (production only).
 * Use in catch blocks of critical API routes (`defineRoute` bunu merkezi catch'te zaten yapar).
 *
 * SDK TEMBEL yüklenir ve yalnız DSN tanımlıysa: `sentry.server.config.ts` / `instrumentation.ts`
 * ile aynı niyet (DSN yokken @sentry/nextjs her serverless grafiğe statik olarak girmesin).
 * Fonksiyon senkron kalır (çağıranlar beklemez); gönderim arka planda olur, asla fırlatmaz.
 */
function sentryEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  if (process.env.DISABLE_SENTRY_INSTRUMENTATION === '1') return false;
  return Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
}

export function captureApiError(
  err: unknown,
  context?: { route?: string; status?: number; [key: string]: unknown }
): void {
  if (!sentryEnabled()) return;
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.captureException(err, { extra: context });
    })
    .catch(() => {
      /* gözlem yolu hata üretmez */
    });
}

/** Hata olmayan ama görünür olması gereken olay (ör. token replay alarmı). */
export function captureApiMessage(message: string, level: 'warning' | 'error' | 'info' = 'warning'): void {
  if (!sentryEnabled()) return;
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.captureMessage(message, level);
    })
    .catch(() => {
      /* gözlem yolu hata üretmez */
    });
}
