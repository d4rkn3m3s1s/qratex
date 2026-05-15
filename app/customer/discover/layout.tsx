import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerDiscover', 'layoutMetadata.customerDiscoverDescription');
}

export default function CustomerDiscoverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
