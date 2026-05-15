import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerConsumptions', 'layoutMetadata.customerConsumptionsDescription');
}

export default function CustomerConsumptionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
