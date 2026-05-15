import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerBadges', 'layoutMetadata.customerBadgesDescription');
}

export default function CustomerBadgesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
