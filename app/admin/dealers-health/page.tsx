/**
 * /admin/dealers-health — Bayi Sağlığı (tek skor + şeffaf bileşenler + bağlamlı playbook önerileri).
 * Sunucu bileşeni: yetki DB'den (`requireAuth`), ilk liste sayfası sunucuda hesaplanır; istemci
 * adası yalnız etkileşimi taşır. Sunucu hesaplaması başarısızsa istemci kendisi çeker ve hatayı
 * görünür gösterir (QueryState) — "200 + sıfırlar" yok.
 */
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { parsePage, parsePageSize, parseSort, serializeSort } from '@/components/ds/data/table-url';
import { FLAG_KEYS, PAGE_SIZES, SORT_KEYS, isBand, listKey, parseWindow, type HealthFlag } from '@/components/admin/a-bayi-sagligi/domain';
import { getHealthList } from '@/components/admin/a-bayi-sagligi/server/list';
import { DealersHealthClient, type InitialList } from '@/components/admin/a-bayi-sagligi/ui/dealers-health-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bayi Sağlığı',
  robots: { index: false, follow: false },
};

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

async function loadInitial(sp: SP): Promise<InitialList | null> {
  if (one(sp.tab) === 'playbooks') return null;
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return null;
  const bandRaw = one(sp.band);
  const flagRaw = one(sp.flag);
  const params = {
    window: parseWindow(one(sp.window)),
    q: one(sp.q) ?? '',
    band: bandRaw && isBand(bandRaw) ? bandRaw : ('' as const),
    flag: flagRaw && (FLAG_KEYS as readonly string[]).includes(flagRaw) ? (flagRaw as HealthFlag) : ('' as const),
    sort: serializeSort(parseSort(one(sp.sort), SORT_KEYS).length ? parseSort(one(sp.sort), SORT_KEYS) : [{ id: 'score', desc: false }]),
    page: parsePage(one(sp.page)),
    size: parsePageSize(one(sp.size), PAGE_SIZES, 20),
  };
  try {
    const data = await getHealthList({
      window: params.window,
      q: params.q || null,
      band: params.band || null,
      flag: params.flag || null,
      sort: params.sort,
      page: params.page,
      size: params.size,
    });
    return { key: listKey(params), data };
  } catch (err) {
    console.error('[dealers-health] sunucu ön hesaplaması başarısız; istemci yeniden deneyecek', err);
    return null;
  }
}

export default async function AdminDealersHealthPage({ searchParams }: { searchParams: Promise<SP> }) {
  const initial = await loadInitial(await searchParams);
  return <DealersHealthClient initial={initial} />;
}
