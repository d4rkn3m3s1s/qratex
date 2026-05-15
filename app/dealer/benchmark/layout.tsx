import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerBenchmark', 'layoutMetadata.dealerBenchmarkDescription');
}

export default function DealerBenchmarkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
