import type { Metadata } from 'next';
import { segmentLayoutMetadataNoindex } from '@/lib/segment-layout-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return segmentLayoutMetadataNoindex('layoutMetadata.authMagicLink', 'layoutMetadata.authMagicLinkDescription');
}

export default function MagicLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
