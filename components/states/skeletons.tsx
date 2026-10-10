import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * İskelet ön ayarları — sayfa tipine göre içerik iskeleti (kabuk ÇİZMEZ:
 * sidebar/başlık layout'ta zaten var). Statik (ops kuralı: shimmer yok).
 * Ekran okuyucuya tek `role="status"` QueryState tarafından verilir.
 */
export type SkeletonPreset = 'list' | 'cards' | 'table' | 'detail' | 'stats' | 'form' | 'block';

export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-border rounded-card border bg-surface-1', className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="hidden h-8 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-card border bg-surface-1 p-card">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="mt-2 h-9 w-28" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4', className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-card border bg-surface-1 p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-8 rounded-control" />
          </div>
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, columns = 4, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-card border bg-surface-1', className)} aria-hidden>
      <div className="flex gap-4 border-b bg-surface-muted px-4 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b px-4 py-3.5 last:border-b-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-4 flex-1', c === 0 && 'max-w-[40%]')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonDetail({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6', className)} aria-hidden>
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-card" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <SkeletonStats count={3} className="lg:grid-cols-3" />
      <div className="space-y-3 rounded-card border bg-surface-1 p-card">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

export function SkeletonForm({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn('space-y-5 rounded-card border bg-surface-1 p-card', className)} aria-hidden>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-11 w-full rounded-control" />
        </div>
      ))}
      <Skeleton className="h-11 w-32 rounded-control" />
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <Skeleton className={cn('h-40 w-full rounded-card', className)} aria-hidden />;
}

export function SkeletonForPreset({ preset = 'list', className }: { preset?: SkeletonPreset; className?: string }) {
  switch (preset) {
    case 'cards':
      return <SkeletonCards className={className} />;
    case 'table':
      return <SkeletonTable className={className} />;
    case 'detail':
      return <SkeletonDetail className={className} />;
    case 'stats':
      return <SkeletonStats className={className} />;
    case 'form':
      return <SkeletonForm className={className} />;
    case 'block':
      return <SkeletonBlock className={className} />;
    case 'list':
    default:
      return <SkeletonList className={className} />;
  }
}
