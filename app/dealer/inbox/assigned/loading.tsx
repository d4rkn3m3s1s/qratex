import { SkeletonList, SkeletonStats } from '@/components/states';

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <SkeletonStats count={4} />
      <SkeletonList rows={6} />
    </div>
  );
}
