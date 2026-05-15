import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerJourneyScore', 'layoutMetadata.customerJourneyScoreDescription');
}

export default function CustomerJourneyScoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
