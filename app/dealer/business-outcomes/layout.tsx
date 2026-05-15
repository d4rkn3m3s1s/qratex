import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerBusinessOutcomes', 'layoutMetadata.dealerBusinessOutcomesDescription');
}

export default function DealerBusinessOutcomesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
