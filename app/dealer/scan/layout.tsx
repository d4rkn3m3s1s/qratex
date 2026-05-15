import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerScan', 'layoutMetadata.dealerScanDescription');
}

export default function DealerScanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
