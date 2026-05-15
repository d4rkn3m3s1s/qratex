import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerAiInsights', 'layoutMetadata.dealerAiInsightsDescription');
}

export default function DealerAiInsightsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
