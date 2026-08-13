'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * PERF: 1008 satırlık bayi analitik body'si ayrı chunk'a alındı + ssr:false ile ertelendi →
 * ilk yükte ağır JS (grafikler dahil) ana thread'i bloklamaz (TBT/RES düzelir). Auth-gated → uygun.
 */
const AnalyticsClient = dynamic(() => import('./analytics-client'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  ),
});

export default function DealerAnalyticsPage() {
  return <AnalyticsClient />;
}
