import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerSurveys', 'layoutMetadata.dealerSurveysDescription');
}

export default function DealerSurveysLayout({ children }: { children: React.ReactNode }) {
  return children;
}
