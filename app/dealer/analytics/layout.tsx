import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerAnalytics', 'layoutMetadata.dealerAnalyticsDescription');
}

export default function DealerAnalyticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
