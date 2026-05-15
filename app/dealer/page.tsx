import type { Metadata } from 'next';
import DealerDashboard from './dealer-dashboard-client';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.dealerDashboard', 'layoutMetadata.dealerDashboardDescription');
}

export default function DealerHomePage() {
  return <DealerDashboard />;
}
