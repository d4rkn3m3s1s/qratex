import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerNearby', 'layoutMetadata.customerNearbyDescription');
}

export default function CustomerNearbyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
