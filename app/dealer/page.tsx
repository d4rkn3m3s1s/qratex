import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { loadDealerToday } from '@/lib/dealer-today/load';
import { greetingFor } from '@/lib/dealer-today/core';
import { prisma } from '@/lib/prisma';
import { DEALER_TODAY_QUERY_KEY } from '@/lib/dealer-today/types';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';
import { TodayPending, TodayScreen, type TodayHeading } from '@/components/dealer/b-bugun/today-screen';

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
  const auth = await requireAuth(['DEALER']);
  if ('error' in auth) return <TodayData />;
  const dealerId = auth.session.user.id;

  // LCP öğesi (selamlama başlığı) ağır Bugün turunu (~20 sorgu) beklemesin: tek hafif sorguyla
  // gerçek bayi adı alınır, başlık + iskelet akışla hemen gider; veri hazır olunca Suspense değiştirir.
  // Bu sorgu da düşerse eski yola (başlık veriyle birlikte) sessizce geri dönülür.
  let heading: TodayHeading | null = null;
  try {
    const user = await prisma.user.findUnique({ where: { id: dealerId }, select: { name: true, businessName: true } });
    const now = new Date();
    if (user) heading = { name: user.businessName?.trim() || user.name?.trim() || null, greeting: greetingFor(now), generatedAt: now.toISOString() };
  } catch (error) {
    console.error('[dealer-today] başlık sorgusu başarısız; başlık veriyle birlikte gelecek', error);
  }
  if (!heading) return <TodayData dealerId={dealerId} />;

  return (
    <Suspense fallback={<TodayPending heading={heading} />}>
      <TodayData dealerId={dealerId} />
    </Suspense>
  );
}

/** Bugün verisini sunucuda yükleyip React Query önbelleğine gömer; istemci adası BFF'i çağırmaz. */
async function TodayData({ dealerId }: { dealerId?: string }) {
  const queryClient = new QueryClient();
  if (dealerId) {
    try {
      queryClient.setQueryData(DEALER_TODAY_QUERY_KEY, await loadDealerToday(dealerId));
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
