'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * PERF: 882 satırlık rozet koleksiyon body'si ayrı chunk'a alındı + ssr:false ile ertelendi →
 * ilk yükte ağır JS ana thread'i bloklamaz (TBT/RES düzelir). Auth-gated müşteri sayfası
 * olduğu için ssr:false uygun; skeleton anında görünür, gövde hidratlanır.
 */
const BadgesClient = dynamic(() => import('./badges-client'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  ),
});

export default function CustomerBadgesPage() {
  return <BadgesClient />;
}
