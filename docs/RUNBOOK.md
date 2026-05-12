# Runbook

Sık karşılaşılan senaryolar için adım adım çözüm rehberi.

## DB Down

1. Vercel/hosting loglarını kontrol et.
2. Prisma connection string doğruluğunu doğrula.
3. Database provider dashboard'dan health check yap.
4. Gerekirse `prisma db push` veya migration resolve.

## Inngest Durdu

1. Inngest Dashboard: https://app.inngest.com
2. Event log ve function run durumunu incele.
3. Rate limit veya hata nedeniyle durmuş olabilir.
4. `USE_INNGEST_QUEUE=true` env kontrol et.

## Rate Limit Aşımı

1. Sentry/Vercel loglarında 429 hatalarına bak.
2. Rate limit key (IP veya user) tespit et.
3. `lib/rate-limit.ts` ve `lib/ai-cost-guard.ts` limitleri gözden geçir.
4. Geçici olarak limit artırılabilir (gerekirse).

## Login 500

1. NextAuth config: `lib/auth.ts`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
2. Prisma Session/Account tabloları erişilebilir mi?
3. JWT strategy: `jti` ve token replay kontrolü aktif mi?
4. DB migration: SessionTokenUsage tablosu var mı?
