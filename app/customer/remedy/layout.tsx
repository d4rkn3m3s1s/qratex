import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerRemedy', 'layoutMetadata.customerRemedyDescription');
}

export default function CustomerRemedyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
