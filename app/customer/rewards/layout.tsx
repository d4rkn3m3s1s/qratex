import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerRewards', 'layoutMetadata.customerRewardsDescription');
}

export default function CustomerRewardsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
