import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerExperiences', 'layoutMetadata.customerExperiencesDescription');
}

export default function CustomerExperiencesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
