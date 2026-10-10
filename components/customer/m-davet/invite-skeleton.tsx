import { SkeletonBlock, SkeletonList, SkeletonStats } from '@/components/states';

/** Davet sayfası iskeleti — gerçek yerleşimle aynı ızgara (düzen kayması yok); statik, shimmer yok. */
export function InviteSkeleton() {
  return (
    <div className="grid items-start gap-section lg:grid-cols-[minmax(0,1fr)_22rem]" aria-hidden>
      <div className="flex min-w-0 flex-col gap-section">
        <SkeletonBlock className="h-[26rem] rounded-card" />
        <SkeletonStats count={3} />
        <SkeletonBlock className="h-56 rounded-card" />
        <SkeletonList rows={3} />
      </div>
      <div className="hidden min-w-0 flex-col gap-section lg:flex">
        <SkeletonBlock className="h-40 rounded-card" />
        <SkeletonBlock className="h-64 rounded-card" />
      </div>
    </div>
  );
}
