import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerGrowthHub', 'layoutMetadata.dealerGrowthHubDescription');
}

export default function DealerGrowthHubLayout({ children }: { children: React.ReactNode }) {
  return children;
}
