import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerReferral', 'layoutMetadata.customerReferralDescription');
}

export default function CustomerReferralLayout({ children }: { children: React.ReactNode }) {
  return children;
}
