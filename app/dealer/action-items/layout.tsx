import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerActionItems', 'layoutMetadata.dealerActionItemsDescription');
}

export default function DealerActionItemsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
