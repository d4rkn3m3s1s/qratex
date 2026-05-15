import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerIncidents', 'layoutMetadata.dealerIncidentsDescription');
}

export default function DealerIncidentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
