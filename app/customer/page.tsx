import type { Metadata } from 'next';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { loadCustomerHome } from '@/lib/customer-home/load';
import { CUSTOMER_HOME_QUERY_KEY } from '@/lib/customer-home/types';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';
import { HomeScreen } from '@/components/customer/m-ana-sayfa/home-screen';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerDashboard', 'layoutMetadata.customerDashboardDescription');
}

/**
 * Müşteri Ana Sayfa (§4.3) — sunucuda ilk render.
 *
 * Kimlik ve rol DB'den doğrulanır (`requireAuth`); veri BFF ile AYNI yükleyiciden gelir ve
 * React Query önbelleğine gömülür (HydrationBoundary) → açılışta istemci isteği yok, oturum
 * yüklenirken "Kullanıcı / 0 puan / hoş geldin" flaşı yok. Sunucu yüklemesi başarısız olursa
 * önbellek boş kalır; istemci adası BFF'i çağırır ve hatayı görünür (tekrar dene) gösterir.
 */
export default async function CustomerHomePage() {
  const queryClient = new QueryClient();
  const auth = await requireAuth(['CUSTOMER']);
  if (!('error' in auth)) {
    try {
      queryClient.setQueryData(CUSTOMER_HOME_QUERY_KEY, await loadCustomerHome(auth.session.user.id));
    } catch (error) {
      console.error('[customer-home] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HomeScreen />
    </HydrationBoundary>
  );
}
