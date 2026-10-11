/**
 * Hata sınırlarından (app/error.tsx, global-error, panel route error) Sentry'ye raporlama.
 *
 * `@sentry/nextjs` burada TEMBEL yüklenir: kök `error.tsx` her sayfanın ilk JS'ine girdiğinden
 * statik `import * as Sentry` @sentry/core'u (~13 KB gzip) hata hiç olmasa da her ziyaretçiye
 * indiriyordu (perf-bundle kapısı). SDK başlatması zaten instrumentation-client.ts'te tembel;
 * hata anında aynı modül örneği yüklenir ve olay ona gider. Raporlama uygulamayı asla bozmaz.
 */
export function captureClientError(error: unknown): void {
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.captureException(error);
    })
    .catch(() => {
      /* gözlem yolu sessizce düşer */
    });
}
