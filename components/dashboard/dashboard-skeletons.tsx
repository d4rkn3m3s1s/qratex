'use client';

import { Skeleton } from '@/components/ui/skeleton';

// ─── Stat Card Skeleton ─────────────────────────────────────
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-5 space-y-3 dark:border-white/[0.08] dark:bg-white/[0.05]">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

// ─── Stats Grid Skeleton ────────────────────────────────────
export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Feedback Card Skeleton ─────────────────────────────────
export function FeedbackCardSkeleton() {
  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border border-border/60 bg-card/70 dark:border-white/[0.08] dark:bg-white/[0.05]">
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
    </div>
  );
}

// ─── Table Row Skeleton ─────────────────────────────────────
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 py-3 px-4">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === 0 ? 'w-8' : i === 1 ? 'w-32' : 'w-20'}`}
        />
      ))}
    </div>
  );
}

// ─── Chart Skeleton ─────────────────────────────────────────
export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-5 space-y-3 dark:border-white/[0.08] dark:bg-white/[0.05]">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
      <Skeleton className={`w-full rounded-lg`} style={{ height }} />
    </div>
  );
}

// ─── List Item Skeleton ─────────────────────────────────────
export function ListItemSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3">
      <Skeleton className="h-9 w-9 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-5 w-12" />
    </div>
  );
}

// ─── Card With List Skeleton ────────────────────────────────
export function CardWithListSkeleton({ rows = 5, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 p-5 space-y-4 dark:border-white/[0.08] dark:bg-white/[0.05]">
      {title && <Skeleton className="h-5 w-36" />}
      <div className="space-y-1 divide-y divide-border/60 dark:divide-white/[0.08]">
        {Array.from({ length: rows }).map((_, i) => (
          <ListItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// ─── Quick Access Grid Skeleton ─────────────────────────────
export function QuickAccessGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border/60 bg-card/70 p-4 space-y-2 dark:border-white/[0.08] dark:bg-white/[0.05]">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

// ─── Full Dashboard Skeletons ───────────────────────────────

export function AdminDashboardSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
      {/* Stats */}
      <StatsGridSkeleton count={5} />
      {/* Main features */}
      <QuickAccessGridSkeleton count={6} />
      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CardWithListSkeleton rows={5} />
        <CardWithListSkeleton rows={5} />
      </div>
      {/* Chart */}
      <ChartSkeleton height={250} />
    </div>
  );
}

export function DealerDashboardSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </div>
      {/* Stats */}
      <StatsGridSkeleton count={4} />
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton height={200} />
        <ChartSkeleton height={200} />
      </div>
      {/* Recent feedbacks */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <FeedbackCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function CustomerDashboardSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {/* Greeting */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/60 bg-card/70 p-4 space-y-2 text-center dark:border-white/[0.08] dark:bg-white/[0.05]">
            <Skeleton className="h-6 w-6 mx-auto rounded-full" />
            <Skeleton className="h-7 w-16 mx-auto" />
            <Skeleton className="h-3 w-12 mx-auto" />
          </div>
        ))}
      </div>
      {/* Quests */}
      <CardWithListSkeleton rows={3} />
      {/* Two column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CardWithListSkeleton rows={5} />
        <CardWithListSkeleton rows={3} />
      </div>
    </div>
  );
}
