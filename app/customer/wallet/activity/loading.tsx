import { SkeletonList } from '@/components/states/skeletons';
import { LoadingLabel } from '@/components/layout/loading-label';

/** Hareketler iskeleti: iç sekmeler + şerit + liste (son düzene uyar; statik, shimmer yok). */
export default function WalletActivityLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-4">
      <LoadingLabel />
      <div className="h-11 w-full max-w-sm rounded-control bg-surface-muted" />
      <div className="h-20 w-full rounded-card border border-subtle bg-surface-1" />
      <SkeletonList rows={6} />
    </div>
  );
}
