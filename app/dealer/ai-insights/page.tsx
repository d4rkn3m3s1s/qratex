'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/** PERF: 2558 satırlık AI içgörü gövdesi ayrı chunk + ssr:false → ilk yükte ana thread bloklanmaz. */
const AiInsightsClient = dynamic(() => import('./ai-insights-client'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  ),
});

export default function DealerAIInsightsPage() {
  return <AiInsightsClient />;
}
