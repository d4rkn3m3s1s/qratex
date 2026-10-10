import { Suspense } from 'react';
import type { Metadata } from 'next';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { headers } from 'next/headers';
import { requireAuth } from '@/lib/api-auth';
import { getModuleControls } from '@/lib/module-gate';
import { getServerLocale } from '@/lib/server-locale';
import { loadInsights } from '@/lib/dealer-insights/server';
import { insightsApiSearch, parseInsightsSearch, recordParams } from '@/lib/dealer-insights/params';
import { insightsQueryKey } from '@/lib/dealer-insights/types';
import { ErrorState } from '@/components/states';
import { InsightsScreen } from '@/components/dealer/b-icgoruler/insights-screen';
import { InsightsSkeleton } from '@/components/dealer/b-icgoruler/skeleton';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Insights', description: 'Measured feedback metrics, themes and signals; the AI only narrates them, with sources.' }
    : { title: 'İçgörüler', description: 'Ölçülen geri bildirim metrikleri, temalar ve sinyaller; AI yalnız kaynaklı olarak anlatır.' };
}

/**
 * Bayi Analitik → İçgörüler (eski `/dealer/ai-insights`) — sunucuda ilk render.
 *
 * Sayıları kod hesaplar (lib/dealer-insights/core), LLM yalnız saklı anlatıyı üretir ve bu
 * yalnız butonla/cron'la olur; bu sayfa ve BFF GET'i LLM çağırmaz. Modül kapısı (`ai_features`)
 * sayfada da uygulanır. SSR yüklemesi başarısızsa istemci adası BFF'i çağırır ve hatayı görünür
 * gösterir.
 */
export default async function DealerInsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const query = parseInsightsSearch(recordParams(sp));
  const [auth, controls, locale] = await Promise.all([
    requireAuth(['DEALER']),
    getModuleControls().catch(() => ({}) as Record<string, boolean>),
    getServerLocale().catch(() => 'tr' as const),
  ]);

  if ((controls as Record<string, boolean | undefined>).ai_features === false) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <ErrorState kind="moduleDisabled" />
      </div>
    );
  }

  const lang = locale === 'en' ? 'en' : 'tr';
  const queryClient = new QueryClient();
  const softNav = (await headers()).get('rsc') === '1';
  if (!softNav && !('error' in auth)) {
    try {
      queryClient.setQueryData(
        insightsQueryKey(insightsApiSearch(query, lang)),
        await loadInsights(auth.session.user.id, query, { locale: lang, canWrite: true })
      );
    } catch (error) {
      console.error('[dealer-insights] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<InsightsSkeleton />}>
        <InsightsScreen />
      </Suspense>
    </HydrationBoundary>
  );
}
