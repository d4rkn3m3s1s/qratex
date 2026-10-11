import { SkeletonStats, SkeletonTable } from '@/components/states';

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6" role="status" aria-label="Kartlar yükleniyor">
      <SkeletonStats />
      <SkeletonTable />
    </div>
  );
}
