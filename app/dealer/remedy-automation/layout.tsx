import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerRemedyAutomation', 'layoutMetadata.dealerRemedyAutomationDescription');
}

export default function DealerRemedyAutomationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
