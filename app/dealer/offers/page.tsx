import type { Metadata } from 'next';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { getServerLocale } from '@/lib/server-locale';
import { loadDealerOffers } from '@/lib/dealer/offers/load.server';
import { DEALER_OFFERS_QUERY_KEY } from '@/lib/dealer/offers/types';
import { OffersScreen } from '@/components/dealer/b-teklifler/offers-screen';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  return locale === 'en'
    ? { title: 'Offers', description: 'Short-lived offers, happy hours and personal offers.' }
    : { title: 'Teklifler', description: 'Kısa süreli teklifler, mutlu saatler ve kişiye özel teklifler.' };
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Pazarlama → Teklifler (§4.3, §6.2). Sunucu önce: kimlik/rol DB'den (`requireAuth`), veri
 * BFF ile AYNI yükleyiciden gelir ve React Query önbelleğine gömülür → açılışta istemci isteği
 * yok. Sunucu yüklemesi başarısız olursa önbellek boş kalır; istemci adası BFF'i çağırır ve
 * hatayı görünür (tekrar dene) gösterir. `?from=innovation`: eski /dealer/innovation
 * yönlendirmesi — parçaların yeni yerlerini gösteren bilgi kartı.
 */
export default async function DealerOffersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [sp, locale, auth] = await Promise.all([
    searchParams,
    getServerLocale().catch(() => 'tr' as const),
    requireAuth(['DEALER']),
  ]);
  const queryClient = new QueryClient();
  if (!('error' in auth)) {
    try {
      queryClient.setQueryData(DEALER_OFFERS_QUERY_KEY, await loadDealerOffers(auth.session.user.id));
    } catch (error) {
      console.error('[dealer-offers] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
    }
  }
  const from = Array.isArray(sp.from) ? sp.from[0] : sp.from;

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OffersScreen locale={locale === 'en' ? 'en' : 'tr'} fromInnovation={from === 'innovation'} />
    </HydrationBoundary>
  );
}
