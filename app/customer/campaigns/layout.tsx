import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerCampaigns', 'layoutMetadata.customerCampaignsDescription');
}

export default function CustomerCampaignsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
