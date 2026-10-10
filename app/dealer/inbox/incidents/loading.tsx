import { SkeletonBlock, SkeletonList, SkeletonStats } from '@/components/states';

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <SkeletonBlock className="h-36" />
      <SkeletonStats count={4} />
      <SkeletonList rows={5} />
    </div>
  );
}
