'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * PERF: 1638 satırlık kullanıcı yönetim body'si ayrı chunk'a alındı + ssr:false ile ertelendi →
 * ilk yükte devasa JS ana thread'i bloklamaz (TBT/RES düzelir). Admin-only → ssr:false güvenli.
 */
const UsersClient = dynamic(() => import('./users-client'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  ),
});

export default function AdminUsersPage() {
  return <UsersClient />;
}
