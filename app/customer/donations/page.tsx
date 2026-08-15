'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/** PERF: 1242 satırlık bağış gövdesi ayrı chunk + ssr:false → ilk yükte ana thread bloklanmaz. */
const DonationsClient = dynamic(() => import('./donations-client'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  ),
});

export default function CustomerDonationsPage() {
  return <DonationsClient />;
}
