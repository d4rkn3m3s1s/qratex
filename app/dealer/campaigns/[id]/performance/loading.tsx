import { SkeletonDetail, SkeletonStats } from '@/components/states';

/** Kampanya performansı yüklenirken statik iskelet. */
export default function CampaignPerformanceLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Kampanya performansı yükleniyor…</span>
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-surface-3" />
        <div className="h-8 w-64 max-w-full rounded bg-surface-3" />
      </div>
      <SkeletonStats />
      <SkeletonDetail />
    </div>
  );
}
