import { Suspense } from 'react';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { headers } from 'next/headers';
import { requireAuth } from '@/lib/api-auth';
import { getModuleControls } from '@/lib/module-gate';
import { loadDealerImpact } from '@/lib/dealer-impact/load';
import { parseImpactSearch, recordParams } from '@/lib/dealer-impact/core';
import { impactQueryKey } from '@/lib/dealer-impact/types';
import { ErrorState, SkeletonStats } from '@/components/states';
import { ImpactScreen } from '@/components/dealer/b-kiyas-etki/impact-screen';

export const dynamic = 'force-dynamic';

/**
 * Bayi Analitik › Etki — eski ROI + İş sonuçları tek ekranda. Sunucuda ilk render: veri BFF ile
 * AYNI yükleyiciden (varsayımlar ve hedefler bayinin kayıtlı ayarlarından) gelir ve React Query
 * önbelleğine gömülür. Yükleme başarısızsa istemci BFF'i çağırır ve hatayı görünür gösterir.
 * Modül kapalıysa açıklayıcı ekran (API de `roi` kapısıyla 403 döner).
 */
export default async function DealerImpactPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const query = parseImpactSearch(recordParams(sp));
  const [auth, controls] = await Promise.all([requireAuth(['DEALER']), getModuleControls().catch(() => ({}) as Record<string, boolean>)]);
  if ((controls as Record<string, boolean | undefined>).roi === false) {
    return <ErrorState kind="moduleDisabled" variant="page" />;
  }
  const queryClient = new QueryClient();
  const softNav = (await headers()).get('rsc') === '1';
  if (!softNav && !('error' in auth)) {
    try {
      queryClient.setQueryData(impactQueryKey(query), await loadDealerImpact(auth.session.user.id, query));
    } catch (error) {
      console.error('[dealer-impact] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
    }
  }
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<SkeletonStats />}>
        <ImpactScreen />
      </Suspense>
    </HydrationBoundary>
  );
}
