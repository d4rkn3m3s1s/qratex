import { SkeletonCards, SkeletonStats } from '@/components/states';
import { LoadingLabel } from '@/components/layout/loading-label';

/** Seslerim yükleniyor: statik iskelet (shimmer yok, ops kaydı). */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-3xl space-y-5">
      <LoadingLabel tr="Seslerin yükleniyor…" en="Loading your voices…" />
      <div className="h-8 w-40 rounded-control bg-surface-muted" />
      <SkeletonStats />
      <SkeletonCards />
    </div>
  );
}
