import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerRoi', 'layoutMetadata.dealerRoiDescription');
}

export default function DealerRoiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
