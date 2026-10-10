/**
 * `GET /api/dealer/analytics/benchmark` — Bayi Kıyas BFF'i (eski `/api/dealer/benchmark`'ın yerine).
 *
 * Sayfa ilk render'ı aynı yükleyiciyle sunucuda yapar; bu uç dönem/akran grubu değişimi ve
 * "Yenile" içindir. Varsayılan reddet: DEALER (kendi işletmesi) ve ADMIN (yalnız `?dealerId=`,
 * salt-okunur); modül kapısı `benchmark` API seviyesinde (denetim B8). GET yan etkisiz, LLM yok.
 *
 * Sorgu: `period=last7|last30|last90` (varsayılan last30), `group=platform|category|city`
 * (verilmezse sunucu seçer), `fresh=1` önbelleği atlar (ayrı ve sıkı hız sınırı).
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { checkRateLimitDb } from '@/lib/rate-limit';
import { BenchmarkDealerNotFoundError, loadDealerBenchmark } from '@/lib/dealer-benchmark/load';
import { benchmarkQuerySchema } from '@/lib/dealer-benchmark/params';
import { BENCHMARK_DEFAULT_PRESET } from '@/lib/dealer-benchmark/types';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    name: 'dealer.analytics.benchmark',
    roles: ['DEALER', 'ADMIN'],
    tenant: 'dealer',
    module: 'benchmark',
    rateLimit: 'read',
    query: benchmarkQuerySchema,
  },
  async ({ tenant, query, user }) => {
    const fresh = query.fresh === '1';
    if (fresh) {
      // Platform anlık görüntüsünü yeniden hesaplatır → kötüye kullanıma karşı dakikada 6.
      const rl = await checkRateLimitDb(`dealer-bench-fresh:${user.id}`, 6, 60_000).catch(() => null);
      if (rl && !rl.ok) {
        throw new ApiError('RATE_LIMITED', undefined, {
          retryable: true,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil((rl.retryAfterMs ?? 60_000) / 1000))) },
        });
      }
    }
    try {
      return ok(
        await loadDealerBenchmark(
          tenant.dealerId,
          { preset: query.period ?? BENCHMARK_DEFAULT_PRESET, group: query.group ?? null },
          { fresh }
        )
      );
    } catch (error) {
      if (error instanceof BenchmarkDealerNotFoundError) throw new ApiError('NOT_FOUND', 'İşletme bulunamadı.');
      throw error;
    }
  }
);
