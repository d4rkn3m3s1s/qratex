import type { Metadata } from 'next';
import StaffFieldPage from './staff-field-client';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.staffField', 'layoutMetadata.staffFieldDescription');
}

export default function StaffFieldRoutePage() {
  return <StaffFieldPage />;
}
