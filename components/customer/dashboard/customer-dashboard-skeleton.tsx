'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useAppT } from '@/lib/app-locale';

/**
 * Client-side skeleton while dashboard data loads (matches hero + bento layout rhythm).
 */
export function CustomerDashboardSkeleton() {
  const t = useAppT();
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-live="polite" aria-label={t('common.loading')}>
      <div className="space-y-6 p-4 md:p-8 pt-6">
        <Skeleton className="h-48 w-full rounded-2xl sm:rounded-3xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="hidden h-32 rounded-3xl md:block" />
          <Skeleton className="hidden h-32 rounded-3xl lg:block" />
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl sm:col-span-2 lg:col-span-1" />
        </div>
      </div>
    </div>
  );
}
