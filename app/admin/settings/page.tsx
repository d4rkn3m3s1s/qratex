'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/** PERF: 2073 satırlık ayarlar gövdesi ayrı chunk + ssr:false → ilk yükte ana thread bloklanmaz. */
const SettingsClient = dynamic(() => import('./settings-client'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  ),
});

export default function AdminSettingsPage() {
  return <SettingsClient />;
}
