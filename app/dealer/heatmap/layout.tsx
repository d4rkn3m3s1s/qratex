import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerHeatmap', 'layoutMetadata.dealerHeatmapDescription');
}

export default function DealerHeatmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
