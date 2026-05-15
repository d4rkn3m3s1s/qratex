import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerLeaderboard', 'layoutMetadata.customerLeaderboardDescription');
}

export default function CustomerLeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
