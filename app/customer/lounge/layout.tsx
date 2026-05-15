import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerLounge', 'layoutMetadata.customerLoungeDescription');
}

export default function CustomerLoungeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
