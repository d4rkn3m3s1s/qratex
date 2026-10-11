import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import {
  SQUAD_DEFAULT_SORT,
  battleListQuerySchema,
  queryString,
  squadListQuerySchema,
} from '@/lib/admin-squads/contract';
import { getSquadStats, listBattles, listSquads } from '@/lib/admin-squads/server';
import { SquadsCenter, type SquadsInitial } from '@/components/admin/a-klanlar/squads-center';

/**
 * Admin → Klan Merkezi (/admin/squads) — Klanlar | Savaşlar | Moderasyon günlüğü.
 * Eski /admin/squads/battles buraya (?tab=battles) kalıcı yönlenir.
 *
 * Sunucu önce: KPI ve URL'deki aktif sekmenin ilk sayfası sunucuda paralel çekilir; istemci
 * adası `initialData` alır. Bir kaynak düşerse istemci kendi sorgusunda görünür hata + "Tekrar
 * dene" gösterir ("200 + sıfırlar" yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Klan Merkezi',
  description: 'Klanları ve klan savaşlarını yönetin; gerekçeli, denetimli moderasyon.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/squads] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminSquadsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, first(v)]));
  const tab = flat.tab === 'battles' ? 'battles' : flat.tab === 'log' ? 'log' : 'squads';

  // Sayfa proxy'de korunur; yetki kararı yine DB'den.
  const auth = await requireAuth(['ADMIN']);
  const allowed = !('error' in auth);

  let squads: SquadsInitial['squads'] = null;
  let battles: SquadsInitial['battles'] = null;
  let stats: SquadsInitial['stats'] = null;

  if (allowed) {
    const sq = squadListQuerySchema.parse({ q: flat.q, status: flat.status, sort: flat.sort, page: flat.page, size: flat.size });
    const view = flat.view || 'live';
    const bq = battleListQuerySchema.parse({
      status: view === 'all' ? undefined : view,
      q: flat.bq,
      origin: flat.origin,
      squadId: flat.squadId || undefined,
      page: flat.bpage,
      size: flat.bsize,
    });
    const [st, sl, bl] = await Promise.all([
      settle(getSquadStats()),
      tab === 'squads' ? settle(listSquads(sq)) : Promise.resolve(null),
      tab === 'battles' ? settle(listBattles(bq)) : Promise.resolve(null),
    ]);
    stats = st;
    if (sl) {
      squads = {
        qs: queryString({ q: sq.q, status: sq.status, sort: sq.sort ?? SQUAD_DEFAULT_SORT, page: sq.page, size: sq.size }),
        page: sl,
      };
    }
    if (bl) {
      battles = {
        qs: queryString({ status: bq.status, q: bq.q, origin: bq.origin, squadId: bq.squadId, page: bq.page, size: bq.size }),
        page: bl,
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
      <SquadsCenter initial={{ stats, squads, battles }} />
    </Suspense>
  );
}
