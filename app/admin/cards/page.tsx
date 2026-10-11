import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { batchListQuerySchema, cardListQuerySchema, cardQueryString, CARD_DEFAULT_SORT } from '@/lib/admin-cards/contract';
import { batchOptions, getCardStats, listBatches, listCards } from '@/lib/admin-cards/server';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { CardsScreen, type CardsInitial } from '@/components/admin/a-kartlar/cards-screen';

/**
 * Admin → Fiziksel Kartlar — kart operasyon konsolu (Dalga 2).
 *
 * Sunucu önce: KPI, URL'deki ilk sayfa, parti seçenekleri (ve parti sekmesi açıksa ilk parti
 * sayfası) paralel çekilir; istemci adasına `initialData` olarak verilir. Bir kaynak düşerse
 * istemci kendi sorgusunda görünür hata + "Tekrar dene" gösterir ("200 + sıfırlar" yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fiziksel Kartlar',
  description: 'QR kart partileri, kart durumu, atama, blok ve baskı listesi.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/cards] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminCardsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, first(v)]));

  // Sayfa proxy'deki admin kapısının arkasında; yetki kararı yine DB'den.
  const auth = await requireAuth(['ADMIN']);
  const allowed = !('error' in auth);

  const parsed = cardListQuerySchema.safeParse(flat);
  const query = parsed.success ? parsed.data : null;
  const qs = query
    ? cardQueryString({ q: query.q, status: query.status, batch: query.batch, usage: query.usage, sort: query.sort ?? CARD_DEFAULT_SORT, page: query.page, size: query.size })
    : '';

  const onBatches = flat.tab === 'batches';
  const bq = batchListQuerySchema.safeParse({ page: flat.bpage || undefined, size: flat.bsize || undefined });
  const bqs = bq.success ? `page=${bq.data.page}&size=${bq.data.size}` : '';

  const [stats, list, options, batches] = allowed
    ? await Promise.all([
        settle(getCardStats()),
        query && !onBatches ? settle(listCards(query)) : Promise.resolve(null),
        settle(batchOptions()),
        onBatches && bq.success ? settle(listBatches(bq.data)) : Promise.resolve(null),
      ])
    : [null, null, null, null];

  const initial: CardsInitial = {
    stats,
    list: list ? { qs, page: list } : null,
    batches: batches ? { qs: bqs, page: batches } : null,
    batchOptions: options,
  };

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
          <SkeletonTable />
        </div>
      }
    >
      <CardsScreen initial={initial} />
    </Suspense>
  );
}
