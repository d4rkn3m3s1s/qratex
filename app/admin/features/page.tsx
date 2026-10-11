import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { getModulesOverview } from '@/lib/admin-flags/modules.server';
import { getRolloutsState } from '@/lib/admin-flags/flags.server';
import { getExperimentsState } from '@/lib/admin-flags/experiments.server';
import { FeatureControl, type FeatureControlInitial } from '@/components/admin/a-ozellik-deney/feature-control';

/**
 * Admin → Özellik ve Deney Kontrolü (/admin/features). Eski /admin/modules ve /admin/ab-testing
 * buraya kalıcı yönlenir.
 *
 * Sunucu önce: genel bakış ve URL'deki aktif sekmenin verisi sunucuda okunur; istemci adası
 * `initialData` alır. Bir kaynak düşerse istemci kendi sorgusunda görünür hata + "Tekrar dene"
 * gösterir ("200 + sıfırlar" yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Özellik ve Deney Kontrolü',
  description: 'Modül anahtarları (API kapısı), kademeli açılış kuralları ve A/B deneyleri.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/features] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminFeaturesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) || 'moduller';
  const initial: FeatureControlInitial = { overview: null, rollouts: null, experiments: null };

  // Sayfa proxy'de korunur (rol + gizli kapı); yetki kararı yine DB'den.
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    const [overview, rollouts, experiments] = await Promise.all([
      settle(getModulesOverview()),
      tab === 'acilis' ? settle(getRolloutsState()) : Promise.resolve(null),
      tab === 'deneyler' ? settle(getExperimentsState()) : Promise.resolve(null),
    ]);
    Object.assign(initial, { overview, rollouts, experiments });
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
      <FeatureControl initial={initial} />
    </Suspense>
  );
}
