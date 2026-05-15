import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerJourneyTimeline', 'layoutMetadata.customerJourneyTimelineDescription');
}

export default function CustomerJourneyTimelineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
