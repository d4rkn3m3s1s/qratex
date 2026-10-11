import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/api-auth';
import { listQuerySchema, listQueryString, type ListQuery } from '@/lib/admin-users/contract';
import { getUsersStats, listUsers } from '@/lib/admin-users/list.server';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { UsersScreen, type UsersInitial } from '@/components/admin/a-kullanicilar/users-screen';

/**
 * Admin → Kullanıcılar (yol haritası §4.3 "Müşteriler/Bayiler → Kullanıcılar (+ 360)").
 *
 * Sunucu önce: KPI ve URL'deki ilk sayfa sunucuda paralel çekilir, istemci adasına
 * `initialData` olarak verilir. Bir kaynak düşerse istemci kendi sorgusunda görünür hata +
 * "Tekrar dene" gösterir ("200 + sıfırlar" yok). Eski `?id=` derin bağlantısı (global arama)
 * Kullanıcı 360 sayfasına yönlenir.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kullanıcılar',
  description: 'Hesapları bulun, 360 görünümde inceleyin, gerekçeli ve geri alınabilir düzeltmeler yapın.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/users] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const deepId = first(sp.id);
  if (deepId && /^[A-Za-z0-9_-]{1,64}$/.test(deepId)) redirect(`/admin/users/${deepId}`);

  // Sayfa proxy'de korunur; yetki kararı yine DB'den (rol değişimi / oturum iptali anında etkili).
  const auth = await requireAuth(['ADMIN']);
  const allowed = !('error' in auth);

  const parsed = listQuerySchema.safeParse(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, first(v)])));
  const query: ListQuery | null = parsed.success ? parsed.data : null;
  const qs = query
    ? listQueryString({
        q: query.q,
        role: query.role,
        status: query.status,
        trust: query.trust,
        fraud: query.fraud,
        plan: query.plan,
        verified: query.verified,
        sort: query.sort ?? 'createdAt.desc',
        page: query.page,
        size: query.size,
      })
    : '';

  const [stats, page] = allowed
    ? await Promise.all([settle(getUsersStats()), query ? settle(listUsers(query)) : Promise.resolve(null)])
    : [null, null];

  const initial: UsersInitial = { stats, list: page ? { qs, page } : null };

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
          <SkeletonTable />
        </div>
      }
    >
      <UsersScreen initial={initial} />
    </Suspense>
  );
}
