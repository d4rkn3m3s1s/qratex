import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerTeam', 'layoutMetadata.dealerTeamDescription');
}

export default function DealerTeamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
