import type { Metadata } from 'next';
import { segmentLayoutMetadataNoindex } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadataNoindex('layoutMetadata.authLogin', 'layoutMetadata.authLoginDescription');
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
