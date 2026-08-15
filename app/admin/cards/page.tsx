'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/** PERF: 1224 satırlık kart yönetim gövdesi ayrı chunk + ssr:false → ilk yükte ana thread bloklanmaz. */
const CardsClient = dynamic(() => import('./cards-client'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  ),
});

export default function AdminCardsPage() {
  return <CardsClient />;
}
