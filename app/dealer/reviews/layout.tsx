import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerReviews', 'layoutMetadata.dealerReviewsDescription');
}

export default function DealerReviewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
