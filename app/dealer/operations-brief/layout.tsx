import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerOperationsBrief', 'layoutMetadata.dealerOperationsBriefDescription');
}

export default function DealerOperationsBriefLayout({ children }: { children: React.ReactNode }) {
  return children;
}
