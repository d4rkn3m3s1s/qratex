import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerFeedbacks', 'layoutMetadata.dealerFeedbacksDescription');
}

export default function DealerFeedbacksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
