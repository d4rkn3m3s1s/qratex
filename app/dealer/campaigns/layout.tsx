import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerCampaigns', 'layoutMetadata.dealerCampaignsDescription');
}

export default function DealerCampaignsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
