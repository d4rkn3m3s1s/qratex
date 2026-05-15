import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerDonations', 'layoutMetadata.customerDonationsDescription');
}

export default function CustomerDonationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
