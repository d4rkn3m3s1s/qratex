import { Suspense } from 'react';
import type { Metadata } from 'next';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { headers } from 'next/headers';
import { requireAuth } from '@/lib/api-auth';
import { getServerLocale } from '@/lib/server-locale';
import { catalogQueryKey, parseCatalogQuery } from '@/lib/dealer/catalog/schemas';
import { loadCatalogPage } from '@/lib/dealer/catalog/server';
import { CatalogScreen } from '@/components/dealer/b-urunler/catalog-screen';
import { CatalogSkeleton } from '@/components/dealer/b-urunler/skeleton';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale().catch(() => 'tr' as const);
  // Eski açıklama sayfada olmayan "stok" vaat ediyordu (Bulgu 13).
  return locale === 'en'
    ? { title: 'Products & menu', description: 'Your catalogue used in Card Scan, with per-product consumption and ratings.' }
    : { title: 'Ürünler ve menü', description: 'Kart Tara’da kullanılan kataloğunuz; ürün bazlı tüketim ve puanlarla.' };
}

/**
 * Bayi → Ürünler ve menü — sunucuda ilk render. Kritik veri (sayfa + kategoriler + içgörüler)
 * sunucuda hazırlanır, istemci adası aynı React Query anahtarını kullanır. SSR yüklemesi
 * başarısızsa ada BFF'i çağırır ve hatayı görünür gösterir (sessiz "ürün yok" yok).
 * `?search=` (global arama derin bağlantısı) `q` olarak okunur.
 */
export default async function DealerProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseCatalogQuery(await searchParams);
  const queryClient = new QueryClient();
  const softNav = (await headers()).get('rsc') === '1';
  if (!softNav) {
    const auth = await requireAuth(['DEALER']);
    if (!('error' in auth)) {
      try {
        queryClient.setQueryData(catalogQueryKey(query), await loadCatalogPage(auth.session.user.id, query, { canWrite: true }));
      } catch (error) {
        console.error('[dealer-products] SSR yüklemesi başarısız; istemci yeniden deneyecek', error);
      }
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogScreen />
      </Suspense>
    </HydrationBoundary>
  );
}
