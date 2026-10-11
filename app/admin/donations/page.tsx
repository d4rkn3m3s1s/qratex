import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { buildProjectQs, projectListQuerySchema } from '@/lib/admin-donations/contract';
import { getDonationStats, listProjects } from '@/lib/admin-donations/server';
import { DonationsCenter, type DonationsInitial } from '@/components/admin/a-kesif-bagis/donations/donations-center';


/**
 * Admin → Bağışlar (/admin/donations) — Kampanyalar · İşlemler.
 *
 * Sunucu önce: KPI'lar ve (Kampanyalar sekmesindeyse) URL'deki ilk liste sayfası sunucuda
 * okunur; istemci adası `initialData` alır. Bir kaynak düşerse istemci kendi sorgusunda görünür
 * hata + "Tekrar dene" gösterir ("200 + sıfırlar" yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bağışlar',
  description: 'Bağış kampanyaları, şeffaf toplam ve bağış makbuzları.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/donations] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminDonationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab = first(sp.tab) || 'kampanyalar';
  const auth = await requireAuth(['ADMIN']);
  const initial: DonationsInitial = { stats: null, projects: null };

  if (!('error' in auth)) {
    const q = projectListQuerySchema.parse({
      q: first(sp.q) || undefined,
      status: first(sp.status) || undefined,
      category: first(sp.category) || undefined,
      sort: first(sp.siralama) || undefined,
      page: first(sp.page) || undefined,
      size: first(sp.size) || undefined,
    });
    const [stats, page] = await Promise.all([
      settle(getDonationStats(prisma)),
      tab === 'kampanyalar' ? settle(listProjects(prisma, q)) : Promise.resolve(null),
    ]);
    initial.stats = stats;
    if (page) {
      initial.projects = {
        qs: buildProjectQs({ q: q.q, status: q.status, category: q.category, sort: q.sort, page: q.page, size: q.size }),
        page,
      };
    }
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
      <DonationsCenter initial={initial} />
    </Suspense>
  );
}
