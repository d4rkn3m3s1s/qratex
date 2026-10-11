import type { Metadata } from 'next';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/api-auth';
import { getModuleControls } from '@/lib/module-gate';
import { loadAdminSection } from '@/lib/admin-analytics/load';
import { adminQueryCacheKey, parseAdminAnalyticsSearch, parseSection, recordParams } from '@/lib/admin-analytics/params';
import { sectionQueryKey } from '@/lib/admin-analytics/types';
import { AdminAnalyticsScreen } from '@/components/admin/a-analitik/analytics-screen';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Platform analitiği',
  description: 'Büyüme, deneyim kalitesi, bayi kıyası ve sektör kırılımı.',
};

/**
 * /admin/analytics — Platform analitiği (a-analitik). /admin/insights burada "Sektörler"
 * sekmesine birleşti (yol haritası §6.3).
 *
 * Sunucu önce (§4.4/11): yetki DB'den (`requireAuth(['ADMIN'])`, admin kapısı dahil); açık sekmenin
 * verisi BFF ile AYNI yükleyiciden gelir ve React Query önbelleğine gömülür → açılışta istemci
 * isteği ve tam sayfa spinner yok (eski sayfa 999 satırlık tamamen istemci bileşeniydi). Sunucu
 * yüklemesi başarısız olursa önbellek boş kalır; istemci adası BFF'i çağırır ve hatayı görünür
 * gösterir ("200 + sıfırlar" yok). Yumuşak gezinmede (RSC) çift yükleme yapılmaz.
 */
export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const params = recordParams(sp);
  const q = parseAdminAnalyticsSearch(params);
  const [auth, controls] = await Promise.all([
    requireAuth(['ADMIN']),
    getModuleControls().catch(() => ({}) as Record<string, boolean>),
  ]);
  if ('error' in auth) redirect('/auth/login');

  const sectorsEnabled = (controls as Record<string, boolean | undefined>).insights_global !== false;
  const requested = parseSection(params.get('tab'));
  const section = requested === 'sectors' && !sectorsEnabled ? 'overview' : requested;

  const queryClient = new QueryClient();
  const softNav = (await headers()).get('rsc') === '1';
  if (!softNav) {
    try {
      queryClient.setQueryData(sectionQueryKey(section, adminQueryCacheKey(q)), await loadAdminSection(section, q));
    } catch (error) {
      console.error('[admin-analytics] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminAnalyticsScreen sectorsEnabled={sectorsEnabled} />
    </HydrationBoundary>
  );
}
