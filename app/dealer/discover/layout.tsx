import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerDiscover', 'layoutMetadata.dealerDiscoverDescription');
}

export default function DealerDiscoverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
