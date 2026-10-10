import { Skeleton } from '@/components/ui/skeleton';

/**
 * Bugün iskeleti — gerçek yerleşimi taklit eder (başlık, 4 metrik, iki sütun, özet); statik,
 * shimmer/nabız yok (ops kaydı, §4.2/4). Yerleşim kayması olmasın diye yükseklikler sabit.
 */
export function TodaySkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-hidden className="space-y-5">
      {!compact && <Skeleton className="h-36 w-full rounded-sheet" />}
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-48 rounded-card" />
          <Skeleton className="h-56 rounded-card" />
        </div>
        <Skeleton className="h-[26rem] rounded-card" />
      </div>
    </div>
  );
}
