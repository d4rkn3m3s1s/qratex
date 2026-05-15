import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerSettings', 'layoutMetadata.customerSettingsDescription');
}

export default function CustomerSettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
