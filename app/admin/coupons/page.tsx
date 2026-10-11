import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { couponListQuerySchema, couponQueryString } from '@/lib/admin-coupons/contract';
import { getCouponStats, listCoupons } from '@/lib/admin-coupons/server';
import { CouponsCenter, type CouponsInitial } from '@/components/admin/a-kutu-kupon/coupons-center';

/**
 * Admin → Kuponlar (/admin/coupons). Sunucu önce: KPI'lar ve URL'deki ilk liste sayfası sunucuda
 * okunur; istemci adası `initialData` alır, düşen kaynak istemcide görünür hata olarak çıkar.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kuponlar',
  description: 'Kampanya kodları: oluşturma, düzenleme, toplu üretim, kullanım ve sürpriz kutu dağıtımı.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/coupons] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminCouponsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, first(v)]));
  const auth = await requireAuth(['ADMIN']);
  const initial: CouponsInitial = { stats: null, list: null };

  if (!('error' in auth)) {
    const q = couponListQuerySchema.parse({
      q: flat.q || undefined,
      status: flat.status || undefined,
      sort: flat.sort || undefined,
      page: flat.page || undefined,
      size: flat.size || undefined,
    });
    const [stats, page] = await Promise.all([settle(getCouponStats()), settle(listCoupons(q))]);
    initial.stats = stats;
    if (page) initial.list = { qs: couponQueryString({ q: flat.q, status: q.status, sort: q.sort, page: q.page, size: q.size }), page };
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
      <CouponsCenter initial={initial} />
    </Suspense>
  );
}
