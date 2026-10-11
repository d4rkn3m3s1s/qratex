import type { Metadata } from 'next';
import { getServerLocale } from '@/lib/server-locale';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { loadAlertsOverview } from '@/lib/dealer-automation/alerts.server';
import { AUTOMATION_KEYS } from '@/lib/dealer-automation/types';
import { AlertsScreen } from '@/components/dealer/b-otomasyon/alerts-screen';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Alert rules · Automation', description: 'Thresholds that decide when the crisis radar opens an incident.' }
    : { title: 'Uyarı kuralları · Otomasyon', description: 'Kriz radarının ne zaman vaka açacağını belirleyen eşikler.' };
}

/** Bayi › Otomasyon › Uyarı kuralları — kriz radarı eşikleri (Gelen Kutusu › Vakalar). */
export default async function AutomationAlertsPage() {
  const auth = await requireAuth(['DEALER']);
  const queryClient = new QueryClient();
  if (!('error' in auth)) {
    try {
      queryClient.setQueryData(AUTOMATION_KEYS.alerts, await loadAlertsOverview(auth.session.user.id));
    } catch (err) {
      console.error('[automation-alerts] SSR yüklemesi başarısız; istemci yeniden deneyecek', err);
    }
  }
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AlertsScreen />
    </HydrationBoundary>
  );
}
