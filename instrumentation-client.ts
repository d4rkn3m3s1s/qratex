/**
 * İstemci gözlemlenebilirliği (arka plan Y5) — Next 15.3+ bu dosyayı `withSentryConfig`'ten
 * BAĞIMSIZ olarak istemci paketine ekler.
 *
 * Neden: Vercel derlemesi `DISABLE_SENTRY_BUILD=1` ile çalışıyor (Sentry webpack eklentisi
 * kapalı) → `sentry.client.config.ts` hiç enjekte edilmiyordu; `app/error.tsx` ve
 * `app/global-error.tsx`'teki `Sentry.captureException` başlatılmamış SDK'ya gidiyor, istemci
 * hataları Sentry'ye HİÇ ulaşmıyordu.
 *
 * DSN yoksa (`NEXT_PUBLIC_SENTRY_DSN` derlemede gömülür) koşul derleme anında sabit `false`
 * olur ve dinamik içe aktarma paketten tamamen düşer — Sentry'siz kurulumda ek bayt yok.
 * DSN varsa SDK ayrı bir parça olarak tembel yüklenir (ilk boyamayı beklemez).
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import('./sentry.client.config').catch(() => {
    /* gözlem yolu uygulamayı asla bozmaz */
  });
}

export {};
