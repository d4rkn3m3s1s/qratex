import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerFeedbacks', 'layoutMetadata.customerFeedbacksDescription');
}

export default function CustomerFeedbacksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
