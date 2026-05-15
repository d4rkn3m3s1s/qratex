import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerSettings', 'layoutMetadata.dealerSettingsDescription');
}

export default function DealerSettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
