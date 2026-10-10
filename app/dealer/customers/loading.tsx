import { SkeletonStats, SkeletonTable } from '@/components/states';

/** Müşteriler — sayfaya özel statik iskelet (shimmer yok; ops kaydı). */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6" aria-busy="true">
      <div className="h-16 w-full max-w-md rounded-card bg-surface-muted" aria-hidden />
      <SkeletonStats />
      <SkeletonTable />
    </div>
  );
}
