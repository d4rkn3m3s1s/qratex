import type { Metadata } from 'next';
import { getServerLocale } from '@/lib/server-locale';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { loadRemedyOverview } from '@/lib/dealer-automation/remedy.server';
import { AUTOMATION_KEYS } from '@/lib/dealer-automation/types';
import { RemedyScreen } from '@/components/dealer/b-otomasyon/remedy-screen';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Remedy automation · Automation', description: 'Remedy drafts for the approval queue and the offer catalog, for low-rated or high churn-risk reviews.' }
    : { title: 'Telafi otomasyonu · Otomasyon', description: 'Düşük puanlı ya da kayıp riski yüksek yorumlar için onay kuyruğuna telafi taslağı ve teklif kataloğu.' };
}

/**
 * Bayi › Otomasyon › Telafi (eski /dealer/remedy-automation + /templates). Ayar, bu ayın
 * sonuçları ve teklif kataloğu sunucuda yüklenir. Modül kapalıysa BFF 403 MODULE_DISABLED
 * döner ve istemci "yetkisiz/kapalı" durumunu gösterir.
 */
export default async function AutomationRemedyPage() {
  const auth = await requireAuth(['DEALER']);
  const queryClient = new QueryClient();
  if (!('error' in auth)) {
    try {
      const { assertModuleEnabled } = await import('@/lib/module-gate');
      const blocked = await assertModuleEnabled('remedy_offers', { userId: auth.session.user.id, routeKey: 'page:/dealer/automation/remedy' });
      if (!blocked) {
        queryClient.setQueryData(AUTOMATION_KEYS.remedy, await loadRemedyOverview(auth.session.user.id));
      }
    } catch (err) {
      console.error('[automation-remedy] SSR yüklemesi başarısız; istemci yeniden deneyecek', err);
    }
  }
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RemedyScreen />
    </HydrationBoundary>
  );
}
