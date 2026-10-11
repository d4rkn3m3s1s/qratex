import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { badgeListQuerySchema, buildListQs } from '@/lib/admin-badges/contract';
import { computeStats, filterCatalog, loadCatalog, sortCatalog } from '@/lib/admin-badges/server';
import { getThresholdsState } from '@/lib/admin-badges/thresholds.server';
import { BadgesCenter, type BadgesInitial } from '@/components/admin/a-rozetler/badges-center';

/**
 * Admin → Rozetler (/admin/badges) — Katalog · Eşikler · Test lab.
 *
 * Sunucu önce: sağlık sayıları ve URL'deki aktif sekmenin ilk verisi (katalog sayfası ya da
 * eşikler) sunucuda okunur; istemci adası `initialData` alır. Bir kaynak düşerse istemci kendi
 * sorgusunda görünür hata + "Tekrar dene" gösterir ("200 + sıfırlar" yok). Test laboratuvarı
 * yalnız sekmesi açılınca yüklenir.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Rozetler',
  description: 'Rozet kataloğu, karakter rozeti eşikleri ve açılış test laboratuvarı.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/badges] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminBadgesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, first(v)]));
  const tab = flat.tab === 'esikler' || flat.tab === 'test' ? flat.tab : 'katalog';

  // Sayfa proxy'de korunur; yetki kararı yine DB'den.
  const auth = await requireAuth(['ADMIN']);
  const initial: BadgesInitial = { stats: null, catalog: null, thresholds: null };

  if (!('error' in auth)) {
    if (tab === 'esikler') {
      initial.thresholds = await settle(getThresholdsState());
    }
    const catalog = await settle(loadCatalog());
    if (catalog) {
      initial.stats = computeStats(catalog);
      if (tab === 'katalog') {
        const set = flat.set === 'series' ? 'series' : 'normal';
        const q = badgeListQuerySchema.parse({
          tab: set,
          series: set === 'series' ? flat.series : undefined,
          q: flat.q && flat.q.trim().length >= 2 ? flat.q : undefined,
          rarity: flat.rarity || undefined,
          health: flat.health || undefined,
          sort: flat.sort || undefined,
          page: flat.page || undefined,
          size: flat.size || undefined,
        });
        const filtered = sortCatalog(filterCatalog(catalog, q), q.sort);
        const start = (q.page - 1) * q.size;
        initial.catalog = {
          qs: buildListQs({ set, series: q.series, q: q.q, rarity: q.rarity, health: q.health, sort: q.sort ?? null, page: q.page, size: q.size }),
          page: { items: filtered.slice(start, start + q.size), total: filtered.length, page: q.page, size: q.size },
        };
      }
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
      <BadgesCenter initial={initial} />
    </Suspense>
  );
}
