import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerAiInsights', 'layoutMetadata.customerAiInsightsDescription');
}

export default function CustomerAiInsightsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
