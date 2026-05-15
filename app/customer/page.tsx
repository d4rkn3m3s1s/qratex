import type { Metadata } from 'next';
import CustomerDashboard from '@/components/customer/dashboard/customer-dashboard';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerDashboard', 'layoutMetadata.customerDashboardDescription');
}

export default function CustomerHomePage() {
  return <CustomerDashboard />;
}
