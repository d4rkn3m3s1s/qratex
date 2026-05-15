import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerVocWall', 'layoutMetadata.dealerVocWallDescription');
}

export default function DealerVocWallLayout({ children }: { children: React.ReactNode }) {
  return children;
}
