import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerAnalytics', 'layoutMetadata.customerAnalyticsDescription');
}

export default function CustomerAnalyticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
