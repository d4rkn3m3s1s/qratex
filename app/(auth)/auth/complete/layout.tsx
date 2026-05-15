import type { Metadata } from 'next';
import { segmentLayoutMetadataNoindex } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadataNoindex('layoutMetadata.authComplete', 'layoutMetadata.authCompleteDescription');
}

export default function AuthCompleteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
