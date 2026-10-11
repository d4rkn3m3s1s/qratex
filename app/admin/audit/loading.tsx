import { SkeletonStats, SkeletonTable } from '@/components/states';
import { Skeleton } from '@/components/ui/skeleton';

/** Gerçek yerleşimle aynı iskelet: başlık + 4 gösterge + hazır görünümler + süzgeç kartı + tablo. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" aria-label="Denetim günlüğü yükleniyor" className="mx-auto max-w-7xl space-y-6">
      <div aria-hidden className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <SkeletonStats />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-36 shrink-0 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-44 w-full rounded-lg" />
        <SkeletonTable />
      </div>
    </div>
  );
}
