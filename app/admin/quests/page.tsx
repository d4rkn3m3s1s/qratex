import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { QUEST_DEFAULT_SORT, queryString, questListQuerySchema } from '@/lib/admin-quests/contract';
import { getQuestStats, listQuests } from '@/lib/admin-quests/server';
import { QuestsCenter, type QuestsInitial } from '@/components/admin/a-gorevler/quests-center';

/**
 * Admin → Görev Yönetimi (/admin/quests).
 *
 * Sunucu önce: KPI şeridi ve URL'deki görünümün ilk sayfası sunucuda paralel çekilir; istemci
 * adası `initialData` alır. Bir kaynak düşerse istemci kendi sorgusunda görünür hata + "Tekrar
 * dene" gösterir ("200 + sıfırlar" yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Görev Yönetimi',
  description: 'Oyunlaştırma görevlerini oluşturun, zamanlayın, ödüllendirin ve performansını izleyin.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/quests] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminQuestsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, first(v)]));

  // Sayfa proxy'de korunur; yetki kararı yine DB'den.
  const auth = await requireAuth(['ADMIN']);
  const initial: QuestsInitial = { stats: null, list: null };

  if (!('error' in auth)) {
    const q = questListQuerySchema.parse({
      q: flat.q,
      status: flat.status || undefined,
      mechanic: flat.mechanic || undefined,
      cadence: flat.cadence || undefined,
      sort: flat.sort || undefined,
      page: flat.page,
      size: flat.size,
    });
    const [stats, list] = await Promise.all([settle(getQuestStats()), settle(listQuests(q))]);
    initial.stats = stats;
    if (list) {
      initial.list = {
        qs: queryString({ q: q.q, status: q.status, mechanic: q.mechanic, cadence: q.cadence, sort: q.sort ?? QUEST_DEFAULT_SORT, page: q.page, size: q.size }),
        page: list,
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
      <QuestsCenter initial={initial} />
    </Suspense>
  );
}
