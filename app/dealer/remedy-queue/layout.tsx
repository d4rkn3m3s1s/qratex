import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerRemedyQueue', 'layoutMetadata.dealerRemedyQueueDescription');
}

export default function DealerRemedyQueueLayout({ children }: { children: React.ReactNode }) {
  return children;
}
