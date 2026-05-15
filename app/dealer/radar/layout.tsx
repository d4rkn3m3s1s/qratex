import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerRadar', 'layoutMetadata.dealerRadarDescription');
}

export default function DealerRadarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
