import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerShop', 'layoutMetadata.customerShopDescription');
}

export default function CustomerShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
