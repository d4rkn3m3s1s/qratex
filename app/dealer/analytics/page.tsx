import { Suspense } from 'react';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { getModuleControls } from '@/lib/module-gate';
import { loadAnalyticsOverview } from '@/lib/dealer-analytics/load';
import { parseAnalyticsSearch, recordParams } from '@/lib/dealer-analytics/params';
import { overviewQueryKey } from '@/lib/dealer-analytics/types';
import { SkeletonStats } from '@/components/states';
import { AnalyticsOverviewScreen } from '@/components/dealer/b-analitik/overview-screen';

export const dynamic = 'force-dynamic';

/**
 * Bayi Analitik → Genel bakış — sunucuda ilk render (yol haritası §4.4/11).
 *
 * Kimlik ve rol DB'den (`requireAuth`); veri BFF ile AYNI yükleyiciden gelir ve React Query
 * önbelleğine gömülür → açılışta istemci isteği ve "iskelet → ikinci spinner" çift geçişi yok
 * (rapor #2, #7). Sunucu yüklemesi başarısız olursa önbellek boş kalır; istemci adası BFF'i
 * çağırır ve hatayı görünür (tekrar dene) gösterir — "200 + sıfırlar" yok.
 */
export default async function DealerAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const query = parseAnalyticsSearch(recordParams(sp));
  const queryClient = new QueryClient();
  const [auth, controls] = await Promise.all([requireAuth(['DEALER']), getModuleControls().catch(() => ({}) as Record<string, boolean>)]);
  if (!('error' in auth)) {
    try {
      queryClient.setQueryData(overviewQueryKey(query), await loadAnalyticsOverview(auth.session.user.id, query));
    } catch (error) {
      console.error('[dealer-analytics] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
    }
  }
  const heatmapEnabled = (controls as Record<string, boolean | undefined>).heatmap !== false;

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<SkeletonStats />}>
        <AnalyticsOverviewScreen heatmapEnabled={heatmapEnabled} />
      </Suspense>
    </HydrationBoundary>
  );
}
