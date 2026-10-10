import { Skeleton } from '@/components/ui/skeleton';

/**
 * İçgörüler iskeleti — gerçek yerleşimi taklit eder (sekme çubuğu, 6 metrik, anlatı + öneriler,
 * uyarı sütunu). Statik; shimmer/nabız yok (ops kaydı, §4.2/4). Yükseklikler sabit (CLS yok).
 */
export function InsightsSkeleton() {
  return (
    <div aria-hidden className="space-y-5">
      <Skeleton className="h-11 w-full max-w-md rounded-control" />
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-56 rounded-card" />
          <Skeleton className="h-72 rounded-card" />
        </div>
        <Skeleton className="h-80 rounded-card" />
      </div>
    </div>
  );
}
