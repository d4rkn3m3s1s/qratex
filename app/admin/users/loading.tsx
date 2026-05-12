import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" aria-label="İçerik yükleniyor">
      <div className="space-y-6 pb-8" aria-hidden>
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="flex gap-4">
          <Skeleton className="h-10 max-w-sm flex-1" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    </div>
  );
}
