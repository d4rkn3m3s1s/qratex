import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerFavorites', 'layoutMetadata.customerFavoritesDescription');
}

export default function CustomerFavoritesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
