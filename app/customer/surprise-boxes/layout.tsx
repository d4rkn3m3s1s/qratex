import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerSurpriseBoxes', 'layoutMetadata.customerSurpriseBoxesDescription');
}

export default function CustomerSurpriseBoxesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
