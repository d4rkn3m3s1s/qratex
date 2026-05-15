import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerSpendingOverview', 'layoutMetadata.customerSpendingOverviewDescription');
}

export default function CustomerSpendingOverviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
