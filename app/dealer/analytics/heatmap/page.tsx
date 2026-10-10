import { Suspense } from 'react';
import type { Metadata } from 'next';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { getModuleControls } from '@/lib/module-gate';
import { getServerLocale } from '@/lib/server-locale';
import { loadActivityHeatmap } from '@/lib/dealer-analytics/load';
import { parseHeatmapSearch, recordParams } from '@/lib/dealer-analytics/params';
import { heatmapQueryKey } from '@/lib/dealer-analytics/types';
import { ErrorState, SkeletonStats } from '@/components/states';
import { ActivityHeatmapScreen } from '@/components/dealer/b-analitik/heatmap-screen';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Activity heatmap', description: 'Busiest days and hours, quality by hour and branch breakdown (Istanbul time).' }
    : { title: 'Yoğunluk', description: 'En yoğun gün ve saatler, saate göre kalite ve şube kırılımı (İstanbul saati).' };
}

/**
 * Bayi Analitik → Yoğunluk (eski `/dealer/heatmap`) — sunucuda ilk render.
 *
 * Modül kapısı sayfada da uygulanır (rapor Bulgu 10: eskiden yalnız menüden gizleniyordu, URL
 * ile açıktı). Veri BFF ile aynı yükleyiciden; başarısızlıkta istemci adası BFF'i çağırır ve
 * hatayı görünür gösterir.
 */
export default async function DealerAnalyticsHeatmapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const query = parseHeatmapSearch(recordParams(sp));
  const [auth, controls] = await Promise.all([requireAuth(['DEALER']), getModuleControls().catch(() => ({}) as Record<string, boolean>)]);

  if ((controls as Record<string, boolean | undefined>).heatmap === false) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <ErrorState kind="moduleDisabled" />
      </div>
    );
  }

  const queryClient = new QueryClient();
  if (!('error' in auth)) {
    try {
      queryClient.setQueryData(heatmapQueryKey(query), await loadActivityHeatmap(auth.session.user.id, query));
    } catch (error) {
      console.error('[dealer-heatmap] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<SkeletonStats count={3} />}>
        <ActivityHeatmapScreen />
      </Suspense>
    </HydrationBoundary>
  );
}
