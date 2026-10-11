import { SkeletonStats, SkeletonTable } from '@/components/states';

export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" aria-label="Geri bildirimler yükleniyor" className="mx-auto max-w-7xl space-y-6">
      <SkeletonStats />
      <SkeletonTable />
    </div>
  );
}
