import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerTrends', 'layoutMetadata.customerTrendsDescription');
}

export default function CustomerTrendsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
