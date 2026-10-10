/**
 * GET /api/dealer/analytics — Bayi Analitik genel bakış BFF'i (b-analitik).
 *
 *  - Varsayılan reddet: `defineRoute` (rol + kiracı + zod + hız sınırı). DEALER kendi verisini
 *    görür; ADMIN yalnız `?dealerId=` ile ve salt-okunur (eski "ölü ADMIN dalı" — rapor B-16).
 *  - Dönem `{range, compare}` sözleşmesi: `?period=last30&compare=previous` ya da
 *    `?from=YYYY-MM-DD&to=YYYY-MM-DD`; geçersiz değer 400 (eskiden serbest metin önbelleğe giriyordu).
 *  - `?fresh=1` önbelleği atlar ("Yenile" gerçekten yeniler); ayrı, sıkı hız sınırı.
 *  - Hata görünür: zarf v2; "200 + sıfırlar" yok.
 */
import { defineRoute, ok, ApiError } from '@/lib/http/define-route';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { analyticsQuerySchema, parseAnalyticsSearch } from '@/lib/dealer-analytics/params';
import { loadAnalyticsOverview } from '@/lib/dealer-analytics/load';

export const dynamic = 'force-dynamic';

const FRESH_LIMIT ={ max: 6, windowMs: 60_000 } as const;

export const GET = defineRoute(
  {
    name: 'dealer.analytics.overview',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    rateLimit: 'read',
    query: analyticsQuerySchema,
  },
  async ({ query, tenant, user, request }) => {
    let fresh = false;
    if (query.fresh === '1') {
      const rl = await checkRateLimitDb(`dealer-analytics:fresh:${user.id}`, FRESH_LIMIT.max, FRESH_LIMIT.windowMs);
      if (!rl.ok) {
        throw new ApiError('RATE_LIMITED', 'Çok sık yenilediniz. Lütfen bir dakika sonra tekrar deneyin.', {
          retryable: true,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil((rl.retryAfterMs ?? FRESH_LIMIT.windowMs) / 1000))) },
        });
      }
      fresh = true;
    }
    const q = parseAnalyticsSearch(request.nextUrl.searchParams);
    return ok(await loadAnalyticsOverview(tenant.dealerId, q, { fresh }));
  }
);
