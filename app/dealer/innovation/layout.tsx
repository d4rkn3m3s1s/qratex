import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerInnovation', 'layoutMetadata.dealerInnovationDescription');
}

export default function DealerInnovationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
