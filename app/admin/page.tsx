import type { Metadata } from 'next';
import AdminDashboard from './admin-dashboard-client';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.adminDashboard', 'layoutMetadata.adminDashboardDescription');
}

export default function AdminHomePage() {
  return <AdminDashboard />;
}
