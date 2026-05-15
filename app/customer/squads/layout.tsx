import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerSquads', 'layoutMetadata.customerSquadsDescription');
}

export default function CustomerSquadsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
