'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

function ChartSlot({ height }: { height: number }) {
  return <Skeleton className="w-full rounded-xl" style={{ height }} />;
}

/** recharts ayrı chunk: bayi paneli ana bundle'ı şişirmez. */
export const SimpleBarChart = dynamic(
  () => import('./simple-bar-chart').then((m) => m.SimpleBarChart),
  { ssr: false, loading: () => <ChartSlot height={220} /> }
);

export const DonutChart = dynamic(
  () => import('./donut-chart').then((m) => m.DonutChart),
  { ssr: false, loading: () => <ChartSlot height={240} /> }
);

export const SimpleAreaChart = dynamic(
  () => import('./simple-area-chart').then((m) => m.SimpleAreaChart),
  { ssr: false, loading: () => <ChartSlot height={200} /> }
);
