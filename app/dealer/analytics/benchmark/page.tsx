import { Suspense } from 'react';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { headers } from 'next/headers';
import { requireAuth } from '@/lib/api-auth';
import { getModuleControls } from '@/lib/module-gate';
import { loadDealerBenchmark } from '@/lib/dealer-benchmark/load';
import { parseBenchmarkSearch } from '@/lib/dealer-benchmark/params';
import { benchmarkQueryKey } from '@/lib/dealer-benchmark/types';
import { recordParams } from '@/lib/dealer-impact/core';
import { ErrorState, SkeletonStats } from '@/components/states';
import { BenchmarkScreen } from '@/components/dealer/b-kiyas-etki/benchmark-screen';

export const dynamic = 'force-dynamic';

/**
 * Bayi Analitik › Kıyas — sunucuda ilk render (yol haritası §4.4/11). Kimlik DB'den
 * (`requireAuth`), veri BFF ile AYNI yükleyiciden gelir ve React Query önbelleğine gömülür.
 * Sunucu yüklemesi başarısız olursa önbellek boş kalır; istemci adası BFF'i çağırır ve hatayı
 * görünür gösterir. Modül kapalıysa açıklayıcı ekran (API de `benchmark` kapısıyla 403 döner).
 */
export default async function DealerBenchmarkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const query = parseBenchmarkSearch(recordParams(sp));
  const [auth, controls] = await Promise.all([requireAuth(['DEALER']), getModuleControls().catch(() => ({}) as Record<string, boolean>)]);
  if ((controls as Record<string, boolean | undefined>).benchmark === false) {
    return <ErrorState kind="moduleDisabled" variant="page" />;
  }
  const queryClient = new QueryClient();
  const softNav = (await headers()).get('rsc') === '1';
  if (!softNav && !('error' in auth)) {
    try {
      queryClient.setQueryData(benchmarkQueryKey(query), await loadDealerBenchmark(auth.session.user.id, query));
    } catch (error) {
      console.error('[dealer-benchmark] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
    }
  }
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<SkeletonStats />}>
        <BenchmarkScreen />
      </Suspense>
    </HydrationBoundary>
  );
}
