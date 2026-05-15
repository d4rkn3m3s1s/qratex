import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerFeedbackJourney', 'layoutMetadata.customerFeedbackJourneyDescription');
}

export default function CustomerFeedbackJourneyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
