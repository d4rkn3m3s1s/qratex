import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerMyCard', 'layoutMetadata.customerMyCardDescription');
}

export default function CustomerMyCardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
