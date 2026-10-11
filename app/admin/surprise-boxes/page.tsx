import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { campaignListQuerySchema, queryString } from '@/lib/admin-surprise-boxes/contract';
import { getStats, listCampaigns } from '@/lib/admin-surprise-boxes/server';
import { BoxesCenter, type BoxesInitial } from '@/components/admin/a-kutu-kupon/boxes-center';

/**
 * Admin → Sürpriz Kutular (/admin/surprise-boxes) — hediye kampanyaları · günlük kutular.
 *
 * Sunucu önce: KPI'lar ve URL'deki ilk kampanya sayfası sunucuda okunur; istemci adası
 * `initialData` alır. Bir kaynak düşerse istemci kendi sorgusunda görünür hata + "Tekrar dene"
 * gösterir. Gönderim paneli ve 3B önizleme yalnız açılınca yüklenir.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sürpriz Kutular',
  description: 'Hediye kutusu kampanyaları, açılma takibi, geri çekme ve günlük kutu olasılık doğrulaması.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/surprise-boxes] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminSurpriseBoxesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, first(v)]));
  const auth = await requireAuth(['ADMIN']);
  const initial: BoxesInitial = { stats: null, list: null };

  if (!('error' in auth)) {
    const q = campaignListQuerySchema.parse({ q: flat.q || undefined, status: flat.status || undefined, page: flat.page || undefined, size: flat.size || undefined });
    const [stats, page] = await Promise.all([
      settle(getStats(auth.session.user.id)),
      flat.tab === 'gunluk' ? Promise.resolve(null) : settle(listCampaigns(q)),
    ]);
    initial.stats = stats;
    if (page) initial.list = { qs: queryString({ q: q.q, status: q.status, page: q.page, size: q.size }), page };
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
          <SkeletonTable />
        </div>
      }
    >
      <BoxesCenter initial={initial} />
    </Suspense>
  );
}
