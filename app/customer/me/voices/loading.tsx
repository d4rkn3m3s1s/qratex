import { SkeletonCards, SkeletonStats } from '@/components/states';

/** Seslerim yükleniyor: statik iskelet (shimmer yok, ops kaydı). */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-3xl space-y-5">
      <span className="sr-only">Seslerin yükleniyor</span>
      <div className="h-8 w-40 rounded-control bg-surface-muted" />
      <SkeletonStats />
      <SkeletonCards />
    </div>
  );
}
