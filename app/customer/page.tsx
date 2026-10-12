import type { Metadata } from 'next';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { headers } from 'next/headers';
import { getToken } from 'next-auth/jwt';
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
  // Yetki kararı (DB) ile veri yüklemesi PARALEL başlar: imzalı JWT'deki kimlikle yükleme
  // yetki gidiş-dönüşünü beklemez (LCP kartı = bakiye; mobil LCP sunucu beklemesine bağlıydı).
  // Veri yalnız yetki onaylanır VE aynı kullanıcıya aitse önbelleğe girer; aksi halde atılır.
  // getToken yalnız imzayı çözer (DB'ye gitmez); yetkili karar yine requireAuth'tadır.
  const token = await getToken({
    req: { headers: await headers() } as Parameters<typeof getToken>[0]['req'],
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  }).catch(() => null);
  const jwtUserId = typeof token?.id === 'string' && token.id ? token.id : typeof token?.sub === 'string' ? token.sub : undefined;
  const [auth, home] = await Promise.all([
    requireAuth(['CUSTOMER']),
    jwtUserId
      ? loadCustomerHome(jwtUserId).catch((error: unknown) => {
          console.error('[customer-home] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
          return null;
        })
      : Promise.resolve(null),
  ]);
  if (!('error' in auth)) {
    const userId = auth.session.user.id;
    // Çerez çözülemediyse / kimlik uyuşmadıysa: doğrulanmış kimlikle sıralı yükle (eski yol).
    const data =
      home && userId === jwtUserId
        ? home
        : await loadCustomerHome(userId).catch((error: unknown) => {
            console.error('[customer-home] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
            return null;
          });
    if (data) queryClient.setQueryData(CUSTOMER_HOME_QUERY_KEY, data);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HomeScreen />
    </HydrationBoundary>
  );
}
