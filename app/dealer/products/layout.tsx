import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerProducts', 'layoutMetadata.dealerProductsDescription');
}

export default function DealerProductsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
