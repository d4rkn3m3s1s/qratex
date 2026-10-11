import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { coverageQuerySchema } from '@/lib/admin-discovery/contract';
import { getCoverage, getDiscoveryState } from '@/lib/admin-discovery/server';
import { DiscoveryCenter, type DiscoveryInitial } from '@/components/admin/a-kesif-bagis/discovery/discovery-center';

/**
 * Admin → Keşif ve sponsorlu (/admin/discovery).
 *
 * Sunucu önce: canlı ayar + sürüm ve (Kapsama sekmesindeyse) kapsama sayfası sunucuda okunur.
 * Bir kaynak düşerse istemci kendi isteğini atar ve hatayı görünür gösterir; ayar okunamazsa
 * düzenleme hiç açılmaz ("boş taslakla canlıyı ezme" yok — rapor Bulgu 1).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Keşif ve sponsorlu',
  description: 'Keşfet kapsaması, sponsorlu duyurular, yedek konumlar, haftanın enleri ve önizleme.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/discovery] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminDiscoveryPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab = first(sp.tab) || 'genel';
  const auth = await requireAuth(['ADMIN']);
  const initial: DiscoveryInitial = { state: null, coverage: null };

  if (!('error' in auth)) {
    const q = coverageQuerySchema.safeParse({ filter: first(sp.filter) || undefined, q: first(sp.q) || undefined, page: first(sp.page) || undefined, size: first(sp.size) || undefined });
    const [state, coverage] = await Promise.all([
      settle(getDiscoveryState(prisma)),
      tab === 'genel' && q.success ? settle(getCoverage(prisma, q.data)) : Promise.resolve(null),
    ]);
    initial.state = state;
    if (coverage && q.success) {
      const qs = new URLSearchParams();
      qs.set('filter', q.data.filter);
      if (q.data.q) qs.set('q', q.data.q);
      qs.set('page', String(q.data.page));
      qs.set('size', String(q.data.size));
      initial.coverage = { qs: qs.toString(), page: coverage };
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
      <DiscoveryCenter initial={initial} />
    </Suspense>
  );
}
