import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerExperienceGuide', 'layoutMetadata.dealerExperienceGuideDescription');
}

export default function DealerExperienceGuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
