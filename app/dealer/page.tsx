import type { Metadata } from 'next';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { loadDealerToday } from '@/lib/dealer-today/load';
import { DEALER_TODAY_QUERY_KEY } from '@/lib/dealer-today/types';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';
import { TodayScreen } from '@/components/dealer/b-bugun/today-screen';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerDashboard', 'layoutMetadata.dealerDashboardDescription');
}

/**
 * Bayi "Bugün" (§4.3) — dashboard + copilot + operasyon özeti + haftalık rapor + kurulum kartı.
 *
 * Kimlik ve rol DB'den (`requireAuth`); veri BFF ile AYNI yükleyiciden gelir ve React Query
 * önbelleğine gömülür → açılışta istemci isteği yok, "0 geri bildirim" flaşı yok. Sunucu
 * yüklemesi başarısız olursa önbellek boş kalır; istemci adası BFF'i çağırır ve hatayı
 * görünür (tekrar dene) gösterir — sıfırlar asla veri gibi gösterilmez.
 */
export default async function DealerTodayPage() {
  const queryClient = new QueryClient();
  const auth = await requireAuth(['DEALER']);
  if (!('error' in auth)) {
    try {
      queryClient.setQueryData(DEALER_TODAY_QUERY_KEY, await loadDealerToday(auth.session.user.id));
    } catch (error) {
      console.error('[dealer-today] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TodayScreen />
    </HydrationBoundary>
  );
}
