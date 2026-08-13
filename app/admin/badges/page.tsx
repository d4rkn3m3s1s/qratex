'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * PERF: ağır (1285 satır) rozet yönetim client body'si ayrı chunk'a alındı ve ssr:false ile
 * ertelendi → ilk yükte devasa JS ana thread'i bloklamaz (TBT/RES düzelir). Admin-only sayfa
 * olduğu için ssr:false (SEO/ilk-boya kaybı yok); shell + skeleton anında görünür, gövde hidratlanır.
 */
const BadgesClient = dynamic(() => import('./badges-client'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  ),
});

export default function AdminBadgesPage() {
  return <BadgesClient />;
}
