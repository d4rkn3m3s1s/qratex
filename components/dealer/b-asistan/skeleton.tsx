import { Skeleton } from '@/components/ui/skeleton';

/** Statik iskelet (ops kaydı: sonsuz animasyon yok). Yerleşim asıl ekranla aynı yükseklikte. */
export function AssistantSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl" aria-hidden>
      <div className="grid h-[calc(100dvh-var(--qx-tabbar-h,0px)-7.5rem)] min-h-[26rem] overflow-hidden rounded-card border border-border bg-surface-1 sm:h-[calc(100dvh-9rem)] lg:h-[calc(100dvh-9.5rem)] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="hidden space-y-3 border-e border-border p-3 lg:block">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <div className="flex flex-col">
          <div className="flex min-h-14 items-center gap-3 border-b border-border px-3">
            <Skeleton className="h-6 w-40" />
          </div>
          <div className="flex-1 space-y-4 p-5">
            <Skeleton className="h-10 w-2/3" />
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
          <div className="border-t border-border p-3">
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
