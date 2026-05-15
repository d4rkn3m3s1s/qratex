import type { Metadata } from 'next';
import StaffDashboard from './staff-dashboard-client';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.staffDashboard', 'layoutMetadata.staffDashboardDescription');
}

export default function StaffHomePage() {
  return <StaffDashboard />;
}
