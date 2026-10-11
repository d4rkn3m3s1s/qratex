/**
 * GET /api/admin/analytics/{overview|dealers|sectors|root-cause|cards} — Admin Analitik BFF'i.
 *
 *  - Varsayılan reddet: `defineRoute` (yalnız ADMIN; admin kapısı `requireAuth` içinde — B-5).
 *  - Dönem `{range, compare}`: `?period=last30&compare=previous` ya da `?from&to`; geçersiz 400 (B-16).
 *  - Süzgeçler: `source=all|qr|consumption`, `clean=0|1` (varsayılan temiz), `sector=<slug>|none`.
 *  - Her bölüm ayrı uç + ayrı önbellek anahtarı (B-6, B-11); `?fresh=1` önbelleği atlar, sıkı limitli.
 *  - Sektör bölümü `insights_global` modül anahtarına bağlı (insights B10).
 *  - Hata görünür: zarf v2, "200 + sıfırlar" yok (B-10).
 */
import { defineRoute, ok, ApiError } from '@/lib/http/define-route';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { adminAnalyticsQuerySchema, parseAdminAnalyticsSearch, sectionParamsSchema } from '@/lib/admin-analytics/params';
import { loadAdminSection } from '@/lib/admin-analytics/load';
import type { AdminAnalyticsSection } from '@/lib/admin-analytics/types';

export const dynamic = 'force-dynamic';

const FRESH_LIMIT = { max: 6, windowMs: 60_000 } as const;
const SECTORS_MODULE_KEY = 'insights_global';

export const GET = defineRoute(
  {
    name: 'admin.analytics.section',
    roles: ['ADMIN'],
    rateLimit: 'read',
    params: sectionParamsSchema,
    query: adminAnalyticsQuerySchema,
  },
  async ({ params, query, user, request }) => {
    const section = params.section as AdminAnalyticsSection;
    if (section === 'sectors') {
      const { assertModuleEnabled } = await import('@/lib/module-gate');
      const blocked = await assertModuleEnabled(SECTORS_MODULE_KEY, { userId: user.id, request, routeKey: 'admin.analytics.sectors' });
      if (blocked) throw new ApiError('MODULE_DISABLED');
    }
    let fresh = false;
    if (query.fresh === '1') {
      const rl = await checkRateLimitDb(`admin-analytics:fresh:${user.id}`, FRESH_LIMIT.max, FRESH_LIMIT.windowMs);
      if (!rl.ok) {
        throw new ApiError('RATE_LIMITED', 'Çok sık yenilediniz. Lütfen bir dakika sonra tekrar deneyin.', {
          retryable: true,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil((rl.retryAfterMs ?? FRESH_LIMIT.windowMs) / 1000))) },
        });
      }
      fresh = true;
    }
    const q = parseAdminAnalyticsSearch(request.nextUrl.searchParams);
    return ok(await loadAdminSection(section, q, { fresh }));
  }
);
