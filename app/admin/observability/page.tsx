import { Suspense } from 'react';
import { requireAuth } from '@/lib/api-auth';
import { SkeletonCards, SkeletonStats } from '@/components/states';
import { obsWindowSchema, type ObservabilitySnapshot } from '@/lib/observability/contract';
import { loadObservability } from '@/lib/observability/server';
import { ObservabilityCenter } from '@/components/admin/a-gozlemlenebilirlik/observability-center';

/**
 * Admin → Gözlemlenebilirlik (/admin/observability).
 *
 * Sunucu önce: sağlık, API uç metrikleri, Web Vitals, Vercel durumu ve iş özeti sunucuda okunur
 * (bölüm başına bağımsız; biri düşerse yalnız o bölüm hata gösterir). İstemci adası yalnız
 * otomatik yenileme, pencere seçimi ve etkileşimi taşır. GET yan etkisizdir.
 */
export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminObservabilityPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.window) ? sp.window[0] : sp.window;
  const window = obsWindowSchema.catch('24h').parse(raw ?? '24h');

  let initial: ObservabilitySnapshot | null = null;
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    try {
      initial = await loadObservability(window);
    } catch (err) {
      console.error('[admin/observability] sunucu ön yüklemesi başarısız:', err);
    }
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
          <SkeletonCards />
        </div>
      }
    >
      <ObservabilityCenter initial={initial} />
    </Suspense>
  );
}
