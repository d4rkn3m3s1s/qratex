# Sentry ve Gözlemlenebilirlik (P2-25)

Hata, latency ve alarm için Sentry + metrikler.

## Uygulanan

- `@sentry/nextjs` kurulu
- `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- `instrumentation.ts` ile server/edge config kaydı
- `withSentryConfig` ile `next.config.js` sarmalama
- Error boundary (`app/error.tsx`) içinde `Sentry.captureException`
- CSP `connect-src` içinde `https://*.ingest.sentry.io`

## Etkinleştirme

1. [Sentry](https://sentry.io) projesi oluştur, DSN al
2. `.env` dosyasına ekle:
   ```
   NEXT_PUBLIC_SENTRY_DSN=https://...@o0.ingest.sentry.io/0
   SENTRY_DSN=https://...@o0.ingest.sentry.io/0
   ```
3. Source map yüklemek için (opsiyonel):
   ```
   SENTRY_ORG=your-org
   SENTRY_PROJECT=your-project
   SENTRY_AUTH_TOKEN=...
   ```

DSN yoksa SDK no-op; veri gönderilmez.

## Metrikler ve alarm

- Hata oranı, latency (p50, p95), queue lag (queue kullanılıyorsa), AI failure rate
- Sentry Alerts veya harici (PagerDuty, Slack) entegrasyonu ile eşik aşımında bildirim
