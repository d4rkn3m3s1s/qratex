import { getServerLocale } from '@/lib/server-locale';
import { SkeletonList, SkeletonStats } from '@/components/states';

/** Kampanyalar yüklenirken statik iskelet (ops kaydı: shimmer yok, yer ayrılır → CLS yok). */
export default async function DealerCampaignsLoading() {
  const en = (await getServerLocale()) === 'en';
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6" role="status" aria-live="polite">
      <span className="sr-only">{en ? 'Loading campaigns…' : 'Kampanyalar yükleniyor…'}</span>
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-surface-3" />
        <div className="h-8 w-48 rounded bg-surface-3" />
      </div>
      <SkeletonStats />
      <SkeletonList rows={4} />
    </div>
  );
}
