import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerChurnRisk', 'layoutMetadata.dealerChurnRiskDescription');
}

export default function DealerChurnRiskLayout({ children }: { children: React.ReactNode }) {
  return children;
}
