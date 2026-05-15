import type { Metadata } from 'next';
import { segmentLayoutMetadata } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadata('layoutMetadata.customerProgressHub', 'layoutMetadata.customerProgressHubDescription');
}

export default function CustomerProgressHubLayout({ children }: { children: React.ReactNode }) {
  return children;
}
