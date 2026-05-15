import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerCopilot', 'layoutMetadata.dealerCopilotDescription');
}

export default function DealerCopilotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
