import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerAiSettings', 'layoutMetadata.dealerAiSettingsDescription');
}

export default function DealerAiSettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
