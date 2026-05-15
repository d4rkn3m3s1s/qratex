import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerConsumptions', 'layoutMetadata.dealerConsumptionsDescription');
}

export default function DealerConsumptionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
